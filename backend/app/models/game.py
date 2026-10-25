"""Game metadata SQLAlchemy model."""
from __future__ import annotations

import uuid
from datetime import date

from datetime import datetime, timezone

from sqlalchemy import Column, Date, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB

from app.models.base import Base, TimestampMixin


class GameMetadata(TimestampMixin, Base):
    __tablename__ = "game_metadata"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, index=True)
    aliases = Column(ARRAY(String), default=list)
    genres = Column(ARRAY(String(100)), default=list)
    developers = Column(ARRAY(String(255)), default=list)
    publishers = Column(ARRAY(String(255)), default=list)
    release_date = Column(Date, nullable=True)
    platforms = Column(ARRAY(String(50)), default=list)
    summary = Column(Text, nullable=True)
    cover_url = Column(String(1024), nullable=True)
    ratings = Column(JSONB, default=list)
    sources = Column(JSONB, default=list)
    media = Column(JSONB, default=list)

    @staticmethod
    def demo_catalog() -> list["GameMetadata"]:
        return [
            GameMetadata(
                name="艾尔登法环",
                aliases=["Elden Ring"],
                genres=["动作角色扮演", "开放世界"],
                developers=["FromSoftware"],
                publishers=["Bandai Namco"],
                platforms=["PC", "PlayStation", "Xbox"],
                summary="在交界地探索、战斗并重塑艾尔登法环的开放世界动作角色扮演游戏。",
                ratings=[{"source": "Steam", "score": 9.0}],
                sources=[{"name": "内置演示数据", "url": ""}],
            ),
            GameMetadata(
                name="塞尔达传说：王国之泪",
                aliases=["The Legend of Zelda: Tears of the Kingdom"],
                genres=["动作冒险", "开放世界"],
                developers=["Nintendo EPD"],
                publishers=["Nintendo"],
                platforms=["Nintendo Switch"],
                summary="以组合能力和立体探索为核心的海拉鲁冒险。",
                sources=[{"name": "内置演示数据", "url": ""}],
            ),
        ]


class GameSource(TimestampMixin, Base):
    __tablename__ = "game_sources"
    __table_args__ = (UniqueConstraint("provider", "external_id", name="uq_game_source_provider_id"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    game_id = Column(UUID(as_uuid=True), ForeignKey("game_metadata.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(50), nullable=False)
    external_id = Column(String(255), nullable=False)
    url = Column(String(2048), nullable=True)
    content_hash = Column(String(64), nullable=True)
    last_crawled_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
