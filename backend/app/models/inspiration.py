"""Inspiration notes SQLAlchemy model."""
from __future__ import annotations

import uuid

from sqlalchemy import Column, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB

from app.models.base import Base, TimestampMixin


class InspirationNote(TimestampMixin, Base):
    __tablename__ = "inspiration_notes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    tags = Column(ARRAY(String(50)), default=list)
    description = Column(Text, nullable=True)
    related_games = Column(ARRAY(UUID(as_uuid=True)), default=list)
    ai_conversation = Column(JSONB, default=list)
    source_project_id = Column(UUID(as_uuid=True), nullable=True)
