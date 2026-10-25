"""Unified LLM abstraction layer.

Inspired by gaming-research-agent-ai (kchia):
Unified interface for OpenAI / Anthropic models with tool calling support."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, AsyncGenerator, Dict, Iterator, List, Optional, Type

from openai import AsyncOpenAI, OpenAI
from pydantic import BaseModel

from app.engine.tooling import Tool

_OFFLINE_CONTENT = (
    "当前未配置 LLM_API_KEY，已使用离线分析模式。建议围绕核心循环、风险收益、"
    "数值反馈和玩家学习曲线拆解问题，并用可验证的原型数据替代主观判断。"
)


@dataclass
class TokenUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


@dataclass
class LLMResponse:
    content: str
    tool_calls: Optional[List[Any]] = None
    token_usage: Optional[TokenUsage] = None


class LLM:
    """Unified LLM interface supporting OpenAI and Anthropic models."""

    def __init__(
        self,
        model: str = "gpt-4o-mini",
        temperature: float = 0.0,
        tools: Optional[List[Tool]] = None,
        api_key: Optional[str] = None,
        max_output_tokens: int = 2000,
    ):
        self.model = model
        self.temperature = temperature
        self.client = OpenAI(api_key=api_key) if api_key else None
        self.async_client = AsyncOpenAI(api_key=api_key) if api_key else None
        self.max_output_tokens = max_output_tokens
        self.tools: Dict[str, Tool] = {t.name: t for t in (tools or [])}

    def invoke(
        self,
        messages: List[Dict[str, str]],
        response_format: Optional[Type[BaseModel]] = None,
    ) -> LLMResponse:
        if self.client is None:
            question = messages[-1].get("content", "") if messages else ""
            return LLMResponse(
                content=f"{_OFFLINE_CONTENT}\n\n分析请求摘要：{question[-500:]}"
            )
        payload: Dict[str, Any] = {
            "model": self.model,
            "temperature": self.temperature,
            "messages": messages,
            "max_tokens": self.max_output_tokens,
        }
        if self.tools:
            payload["tools"] = [t.to_openai_tool() for t in self.tools.values()]
            payload["tool_choice"] = "auto"

        if response_format:
            payload["response_format"] = response_format
            response = self.client.beta.chat.completions.parse(**payload)
        else:
            response = self.client.chat.completions.create(**payload)

        choice = response.choices[0]
        usage = response.usage
        return LLMResponse(
            content=choice.message.content or "",
            tool_calls=choice.message.tool_calls,
            token_usage=TokenUsage(
                prompt_tokens=usage.prompt_tokens,
                completion_tokens=usage.completion_tokens,
                total_tokens=usage.total_tokens,
            ) if usage else None,
        )

    def stream(self, messages: List[Dict[str, str]]) -> Iterator[str]:
        """Yield text chunks incrementally. Falls back to offline message when no API key."""
        if self.client is None:
            question = messages[-1].get("content", "") if messages else ""
            yield f"{_OFFLINE_CONTENT}\n\n分析请求摘要：{question[-500:]}"
            return
        payload: Dict[str, Any] = {
            "model": self.model,
            "temperature": self.temperature,
            "messages": messages,
            "max_tokens": self.max_output_tokens,
            "stream": True,
        }
        for chunk in self.client.chat.completions.create(**payload):
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                yield delta

    async def astream(self, messages: List[Dict[str, str]]) -> AsyncGenerator[str, None]:
        """Yield model chunks as they arrive without blocking the event loop."""
        if self.async_client is None:
            question = messages[-1].get("content", "") if messages else ""
            yield f"{_OFFLINE_CONTENT}\n\n分析请求摘要：{question[-500:]}"
            return

        stream = await self.async_client.chat.completions.create(
            model=self.model,
            temperature=self.temperature,
            messages=messages,
            max_tokens=self.max_output_tokens,
            stream=True,
        )
        try:
            async for chunk in stream:
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if delta:
                    yield delta
        finally:
            await stream.close()
