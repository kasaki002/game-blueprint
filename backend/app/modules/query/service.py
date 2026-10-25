"""Game Query - Business logic."""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game import GameMetadata


class QueryService:
    """Handles game search, aggregation, and data retrieval."""

    async def search(self, db: AsyncSession, q: str, page: int = 1, page_size: int = 20) -> dict:
        term = f"%{q.strip()}%"
        # Use array_to_string for case-insensitive fuzzy matching on aliases
        condition = or_(
            GameMetadata.name.ilike(term),
            GameMetadata.summary.ilike(term),
            func.array_to_string(GameMetadata.aliases, ' ').ilike(term),
            func.array_to_string(GameMetadata.genres, ' ').ilike(term),
            func.array_to_string(GameMetadata.developers, ' ').ilike(term),
            func.array_to_string(GameMetadata.publishers, ' ').ilike(term),
            func.array_to_string(GameMetadata.platforms, ' ').ilike(term),
        )
        total = await db.scalar(select(func.count()).select_from(GameMetadata).where(condition))
        rows = await db.scalars(
            select(GameMetadata)
            .where(condition)
            .order_by(GameMetadata.name)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return {
            "results": [self._serialize(game, detail=False) for game in rows],
            "total": total or 0,
            "page": page,
            "page_size": page_size,
        }

    async def get_detail(self, db: AsyncSession, game_id: str) -> dict | None:
        try:
            game = await db.get(GameMetadata, UUID(game_id))
        except ValueError:
            return None
        return self._serialize(game, detail=True) if game else None

    @staticmethod
    def _serialize(game: GameMetadata, detail: bool) -> dict:
        data = {
            "id": game.id,
            "name": game.name,
            "aliases": game.aliases or [],
            "genres": game.genres or [],
            "developers": game.developers or [],
            "release_date": game.release_date,
            "cover_url": game.cover_url,
            "summary": game.summary,
        }
        if detail:
            data.update(
                publishers=game.publishers or [],
                platforms=game.platforms or [],
                ratings=game.ratings or [],
                sources=game.sources or [],
                media=game.media or [],
            )
        return data
