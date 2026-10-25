"""Decorator-based tool system with automatic JSON schema inference.

Inspired by gaming-research-agent-ai (kchia):
Auto-infers JSON Schema from Python type hints via inspect + typing module."""

from __future__ import annotations

import inspect
from functools import wraps
from typing import Any, Callable, Dict, List, Literal, Optional, get_args, get_origin, get_type_hints


class Tool:
    """A callable tool with auto-inferred JSON schema for LLM tool calling."""

    def __init__(self, func: Callable, name: Optional[str] = None, description: Optional[str] = None):
        self.func = func
        self.name = name or func.__name__
        self.description = description or inspect.getdoc(func)
        self.signature = inspect.signature(func, eval_str=True)
        self.type_hints = get_type_hints(func)
        self.parameters = [self._build_param_schema(k, p) for k, p in self.signature.parameters.items()]

    def _build_param_schema(self, name: str, param: inspect.Parameter) -> dict:
        typ = self.type_hints.get(name, str)
        schema = self._resolve_type(typ)
        return {"name": name, "schema": schema, "required": param.default is inspect.Parameter.empty}

    def _resolve_type(self, typ: Any) -> dict:
        origin = get_origin(typ)
        if origin is Literal:
            return {"type": "string", "enum": list(get_args(typ))}
        if origin is Union:
            args = [a for a in get_args(typ) if a is not type(None)]
            return self._resolve_type(args[0]) if args else {"type": "string"}
        if origin is list:
            return {"type": "array", "items": self._resolve_type(get_args(typ)[0]) if get_args(typ) else {"type": "string"}}
        mapping = {str: "string", int: "integer", float: "number", bool: "boolean"}
        return {"type": mapping.get(typ, "string")}

    def to_openai_tool(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": {p["name"]: p["schema"] for p in self.parameters},
                    "required": [p["name"] for p in self.parameters if p["required"]],
                    "additionalProperties": False,
                },
            },
        }

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        return self.func(*args, **kwargs)


def tool(func=None, *, name: str = None, description: str = None):
    """Decorator: @tool or @tool(name='foo', description='bar')"""
    def wrapper(f: Callable) -> Tool:
        return Tool(f, name=name, description=description)
    return wrapper(func) if func else wrapper
