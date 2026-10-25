from __future__ import annotations

import argparse
import asyncio

from app.core.database import async_session_factory
from app.engine.indexing import reindex_all


async def reindex() -> None:
    async with async_session_factory() as session:
        count = await reindex_all(session)
        await session.commit()
    print(f"Indexed {count} document chunks")


def main() -> None:
    parser = argparse.ArgumentParser(prog="game-blueprint")
    parser.add_argument("command", choices=["reindex"])
    args = parser.parse_args()
    if args.command == "reindex":
        asyncio.run(reindex())


if __name__ == "__main__":
    main()
