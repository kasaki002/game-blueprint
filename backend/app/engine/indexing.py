from __future__ import annotations

import asyncio
import hashlib
from datetime import datetime, timezone
from typing import Iterable
from uuid import UUID

from openai import OpenAI
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.engine.text_search import search_text
from app.models.analysis import DocumentChunk
from app.models.game import GameMetadata


def split_text(text: str) -> list[str]:
    text = " ".join(text.split())
    size = max(settings.chunk_size, 128)
    overlap = min(settings.chunk_overlap, size // 2)
    chunks, start = [], 0
    while start < len(text):
        chunks.append(text[start:start + size])
        start += size - overlap
    return chunks or [""]


async def _embeddings(texts: list[str]) -> list[list[float] | None]:
    if not settings.openai_api_key or not texts:
        return [None] * len(texts)
    try:
        client = OpenAI(api_key=settings.openai_api_key)
        response = await asyncio.to_thread(client.embeddings.create, model=settings.embedding_model, input=texts)
        return [item.embedding for item in response.data]
    except Exception:
        return [None] * len(texts)


async def index_game(db: AsyncSession, game_id: UUID) -> int:
    game = await db.get(GameMetadata, game_id)
    if not game:
        return 0
    text = "\n".join(filter(None, [
        game.name, " / ".join(game.aliases or []), game.summary,
        "类型：" + "、".join(game.genres or []), "开发者：" + "、".join(game.developers or []),
        "发行商：" + "、".join(game.publishers or []), "平台：" + "、".join(game.platforms or []),
    ]))
    chunks = split_text(text)
    vectors = await _embeddings(chunks)
    hashes = [hashlib.sha256(chunk.encode()).hexdigest() for chunk in chunks]
    existing = set(await db.scalars(select(DocumentChunk.content_hash).where(DocumentChunk.source_type == "game", DocumentChunk.source_id == str(game.id))))
    if existing == set(hashes):
        return 0
    await db.execute(delete(DocumentChunk).where(DocumentChunk.source_type == "game", DocumentChunk.source_id == str(game.id)))
    for index, (content, content_hash, embedding) in enumerate(zip(chunks, hashes, vectors)):
        db.add(DocumentChunk(
            source_type="game", source_id=str(game.id), chunk_index=index, title=game.name,
            content=content, content_hash=content_hash, source_url=next((item.get("url") for item in (game.sources or []) if item.get("url")), None),
            source_metadata={"provider": "game", "genres": game.genres or []}, captured_at=datetime.now(timezone.utc), embedding=embedding,
            search_vector=func.to_tsvector("simple", search_text(content)),
        ))
    await db.flush()
    return len(chunks)


async def index_raw_document(db: AsyncSession, provider: str, source_id: str, title: str, url: str | None, raw_text: str, captured_at: datetime) -> int:
    chunks = split_text(raw_text)
    vectors = await _embeddings(chunks)
    hashes = [hashlib.sha256(chunk.encode()).hexdigest() for chunk in chunks]
    existing = set(await db.scalars(select(DocumentChunk.content_hash).where(DocumentChunk.source_type == "raw", DocumentChunk.source_id == f"{provider}:{source_id}")))
    if existing == set(hashes):
        return 0
    await db.execute(delete(DocumentChunk).where(DocumentChunk.source_type == "raw", DocumentChunk.source_id == f"{provider}:{source_id}"))
    for index, (content, content_hash, embedding) in enumerate(zip(chunks, hashes, vectors)):
        db.add(DocumentChunk(source_type="raw", source_id=f"{provider}:{source_id}", chunk_index=index, title=title, content=content, content_hash=content_hash, source_url=url, source_metadata={"provider": provider}, captured_at=captured_at, embedding=embedding, search_vector=func.to_tsvector("simple", search_text(content))))
    await db.flush()
    return len(chunks)


async def reindex_all(db: AsyncSession) -> int:
    game_ids: Iterable[UUID] = await db.scalars(select(GameMetadata.id).order_by(GameMetadata.id))
    total = 0
    for game_id in game_ids:
        total += await index_game(db, game_id)
    return total
