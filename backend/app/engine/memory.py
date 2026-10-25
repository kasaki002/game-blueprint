"""Dual-memory architecture: ShortTermMemory + LongTermMemory.

Inspired by gaming-research-agent-ai (kchia):
- ShortTerm: session-scoped conversation history
- LongTerm: persistent vector-based fact storage"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional


class SessionNotFoundError(Exception):
    pass


@dataclass
class ShortTermMemory:
    """Session-scoped object history. Each session stores a list of Run objects."""

    sessions: Dict[str, List[Any]] = field(default_factory=lambda: {"default": []})

    def create_session(self, session_id: str) -> bool:
        if session_id in self.sessions:
            return False
        self.sessions[session_id] = []
        return True

    def delete_session(self, session_id: str) -> bool:
        if session_id == "default":
            raise ValueError("Cannot delete default session")
        return bool(self.sessions.pop(session_id, None))

    def add(self, obj: Any, session_id: Optional[str] = None):
        sid = session_id or "default"
        self.sessions.setdefault(sid, []).append(copy.deepcopy(obj))

    def get_all(self, session_id: Optional[str] = None) -> List[Any]:
        sid = session_id or "default"
        return [copy.deepcopy(o) for o in self.sessions.get(sid, [])]

    def get_last(self, session_id: Optional[str] = None) -> Optional[Any]:
        objects = self.get_all(session_id)
        return objects[-1] if objects else None

    def reset(self, session_id: Optional[str] = None):
        if session_id is None:
            for sid in self.sessions:
                self.sessions[sid] = []
        else:
            self.sessions[session_id] = []


@dataclass
class MemoryFragment:
    content: str
    owner: str
    namespace: str = "default"
    timestamp: int = field(default_factory=lambda: int(datetime.now().timestamp()))


@dataclass
class MemorySearchResult:
    fragments: List[MemoryFragment]
    metadata: Dict[str, Any]


class LongTermMemory:
    """Persistent vector-based fact storage.
    NOTE: Full ChromaDB integration deferred; stub uses in-memory store.
    When ready, replace _store with VectorStore(chroma_collection)."""

    def __init__(self):
        self._store: List[MemoryFragment] = []

    def register(self, fragment: MemoryFragment):
        self._store.append(fragment)

    def search(self, query_text: str, owner: str, limit: int = 3, namespace: str = "default") -> MemorySearchResult:
        # Simple keyword fallback; replace with vector similarity when ChromaDB is wired
        results = [
            f for f in self._store
            if f.owner == owner and f.namespace == namespace and query_text.lower() in f.content.lower()
        ][:limit]
        return MemorySearchResult(fragments=results, metadata={"count": len(results)})
