from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from openai import OpenAI
from sqlalchemy import Integer, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.engine.text_search import query_tokens, tsquery_text
from app.models.analysis import DocumentChunk


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _snippet(content: str, tokens: list[str], width: int = 500) -> str:
    """Show the part of a chunk that actually matched, not its JSON header."""
    if not content:
        return ""
    lowered = content.casefold()
    position = -1
    for token in tokens:
        index = lowered.find(token)
        if index >= 0 and (position < 0 or index < position):
            position = index
    if position <= 0:
        return content[:width]
    start = max(0, position - width // 4)
    return content[start:start + width]


class HybridRetriever:
    def __init__(self) -> None:
        self.client = OpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None

    async def embed(self, text: str) -> list[float] | None:
        if not self.client:
            return None
        try:
            response = await asyncio.to_thread(
                self.client.embeddings.create,
                model=settings.embedding_model,
                input=text,
            )
            return response.data[0].embedding
        except Exception:
            return None

    async def _sparse_search(self, db: AsyncSession, query: str, tokens: list[str]) -> list[DocumentChunk]:
        """Full-text candidates using CJK bigrams instead of raw ``simple``."""
        if not query.strip():
            return []
        if tokens:
            token_queries = [func.plainto_tsquery("simple", token) for token in tokens]
            # ``ts_rank_cd`` has no IDF: a chunk full of common bigrams such as
            # 战斗/设计 can outrank the chunk that actually names the game.
            # Rank by how many distinct query tokens each candidate contains
            # first, then use cover density as the tie-breaker.
            hit_count = sum(
                func.coalesce(cast(DocumentChunk.search_vector.op("@@")(term), Integer), 0)
                for term in token_queries
            )
            tsquery = func.to_tsquery("simple", tsquery_text(tokens))
            rows = list(await db.scalars(
                select(DocumentChunk)
                .where(or_(*(DocumentChunk.search_vector.op("@@")(term) for term in token_queries)))
                .order_by(hit_count.desc(), func.ts_rank_cd(DocumentChunk.search_vector, tsquery).desc())
                .limit(40)
            ))
            if rows:
                return rows

        # Fallback for single-character terms, exact titles and chunks indexed
        # before the CJK tokenizer existed.  ``escape`` keeps user-supplied
        # wildcards from turning into accidental LIKE patterns.
        pattern = f"%{_escape_like(query.strip())}%"
        return list(await db.scalars(
            select(DocumentChunk)
            .where(or_(
                DocumentChunk.content.ilike(pattern, escape="\\"),
                DocumentChunk.title.ilike(pattern, escape="\\"),
            ))
            .order_by(DocumentChunk.captured_at.desc().nullslast())
            .limit(20)
        ))

    async def search(self, db: AsyncSession, query: str, limit: int | None = None) -> list[dict[str, Any]]:
        limit = limit or settings.top_k
        if not query.strip():
            return []
        tokens = query_tokens(query)
        sparse_rows = await self._sparse_search(db, query, tokens)
        dense_rows: list[DocumentChunk] = []
        embedding = await self.embed(query)
        if embedding:
            dense_rows = list(await db.scalars(
                select(DocumentChunk).where(DocumentChunk.embedding.is_not(None))
                .order_by(DocumentChunk.embedding.cosine_distance(embedding)).limit(40)
            ))

        scores: dict[Any, float] = defaultdict(float)
        rows: dict[Any, DocumentChunk] = {}
        for candidates in (dense_rows, sparse_rows):
            for rank, row in enumerate(candidates, start=1):
                rows[row.id] = row
                scores[row.id] += 1 / (60 + rank)

        # Pure reciprocal-rank fusion.  The previous quality/freshness/diversity
        # multipliers were larger than the gap between adjacent RRF ranks and
        # silently re-ordered results: a Steam chunk matching two query bigrams
        # could outrank the game chunk matching four.  Keep ranking explainable;
        # reintroduce source quality only as a small documented tie-breaker.
        ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
        return [
            {
                "document_id": str(rows[chunk_id].id), "title": rows[chunk_id].title, "url": rows[chunk_id].source_url,
                "captured_at": rows[chunk_id].captured_at.isoformat() if rows[chunk_id].captured_at else None,
                "snippet": _snippet(rows[chunk_id].content, tokens), "content": rows[chunk_id].content, "score": score,
                "provider": str((rows[chunk_id].source_metadata or {}).get("provider", rows[chunk_id].source_type)),
                "source_type": rows[chunk_id].source_type,
            }
            for chunk_id, score in ranked[:limit]
        ]
