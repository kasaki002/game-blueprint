"""Database connections and sessions."""
from __future__ import annotations

from typing import Any

try:
    from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
except ImportError:  # MongoDB is optional for the local/offline MVP.
    AsyncIOMotorClient = None  # type: ignore[assignment]
    AsyncIOMotorDatabase = Any  # type: ignore[misc,assignment]
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

# --- PostgreSQL (async via SQLAlchemy) ---
engine = create_async_engine(settings.postgres_dsn, echo=settings.debug)
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_pg_session() -> AsyncSession:
    """Yield an async SQLAlchemy session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# --- MongoDB (via Motor) ---
_mongo_client: Any | None = None


async def get_mongo_client() -> AsyncIOMotorClient:
    global _mongo_client
    if AsyncIOMotorClient is None:
        raise RuntimeError("MongoDB support requires the 'motor' package")
    if _mongo_client is None:
        _mongo_client = AsyncIOMotorClient(settings.mongo_dsn)
    return _mongo_client


async def get_mongo_db() -> AsyncIOMotorDatabase:
    client = await get_mongo_client()
    return client[settings.mongo_db]


async def initialize_database() -> None:
    """Validate connectivity. Schema changes are managed exclusively by Alembic."""
    from sqlalchemy import text

    async with engine.connect() as connection:
        await connection.execute(text("SELECT 1"))


async def close_databases() -> None:
    global _mongo_client
    if _mongo_client is not None:
        _mongo_client.close()
        _mongo_client = None
    await engine.dispose()
