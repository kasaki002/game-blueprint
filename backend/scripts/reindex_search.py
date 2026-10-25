"""Rebuild ``document_chunks.search_vector`` with CJK-aware tokens.

Run after upgrading from the old raw ``to_tsvector('simple', content)`` index,
or whenever the tokenizer in :mod:`app.engine.text_search` changes.  This does
not call the embedding API, so it is safe to run without an OpenAI key::

    python -m scripts.reindex_search
"""
from __future__ import annotations

import asyncio

from sqlalchemy import func, select, update

from app.core.database import async_session_factory, close_databases
from app.engine.text_search import search_text
from app.models.analysis import DocumentChunk


async def rebuild_search_vectors() -> int:
    async with async_session_factory() as session:
        rows = (await session.execute(
            select(DocumentChunk.id, DocumentChunk.content)
        )).all()
        for chunk_id, content in rows:
            await session.execute(
                update(DocumentChunk)
                .where(DocumentChunk.id == chunk_id)
                .values(search_vector=func.to_tsvector("simple", search_text(content)))
            )
        await session.commit()
    return len(rows)


async def main() -> None:
    try:
        count = await rebuild_search_vectors()
        print(f"Rebuilt search vectors for {count} document chunks.")
    finally:
        await close_databases()


if __name__ == "__main__":
    asyncio.run(main())
