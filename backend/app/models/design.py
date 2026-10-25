"""Design project SQLAlchemy models.

Canvas content is stored as a single versioned JSON document in
``DesignProject.canvas_state``.  The former ``design_nodes`` table was never
used by the editor and is being removed; see the ``20261025_0002`` migration.
"""
from __future__ import annotations

import uuid

from sqlalchemy import Column, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.models.base import Base, TimestampMixin


class DesignProject(TimestampMixin, Base):
    __tablename__ = "design_projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    source_note_id = Column(UUID(as_uuid=True), nullable=True)
    canvas_state = Column(JSONB, default=dict)
    revision = Column(Integer, default=0, nullable=False)
