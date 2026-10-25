"""Rebuild searchable chunks and embeddings for all game metadata."""
from __future__ import annotations

import asyncio

from app.core.database import async_session_factory, close_databases
from app.engine.indexing import reindex_all


async def main() -> None:
    try:
        async with async_session_factory() as session:
            count = await reindex_all(session)
            await session.commit()
        print(f"Reindexed {count} document chunks.")
    finally:
        await close_databases()


if __name__ == "__main__":
    asyncio.run(main())
