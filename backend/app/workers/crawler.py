"""Compatibility facade for the structured crawl pipeline."""
from __future__ import annotations

from app.workers.pipeline import CrawlPipeline


class CrawlerPipeline:
    async def search_and_crawl(self, game_name: str) -> dict:
        async def no_progress(_stage: str, _progress: int) -> None:
            return None

        result = await CrawlPipeline().run(game_name, no_progress)
        return {
            "status": result.status,
            "game_ids": result.game_ids,
            "warnings": result.warnings,
        }
