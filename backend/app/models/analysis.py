"""Persisted game analysis reports."""
from __future__ import annotations

import uuid

from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.dialects.postgresql import TSVECTOR
from pgvector.sqlalchemy import Vector

from app.models.base import Base, TimestampMixin


class AnalysisReport(TimestampMixin, Base):
    __tablename__ = "analysis_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    game_id = Column(UUID(as_uuid=True), ForeignKey("game_metadata.id", ondelete="CASCADE"), nullable=False, index=True)
    report_type = Column(String(50), nullable=False, index=True)
    content = Column(Text, nullable=False)
    charts_data = Column(JSONB, default=list, nullable=False)
    citations = Column(JSONB, default=list, nullable=False)
    generation_meta = Column(JSONB, default=dict, nullable=False)


class ChatSession(TimestampMixin, Base):
    __tablename__ = "chat_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    game_id = Column(UUID(as_uuid=True), ForeignKey("game_metadata.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(255), nullable=False, default="New chat")
    summary = Column(Text, nullable=True)


class ChatMessage(TimestampMixin, Base):
    __tablename__ = "chat_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False, default="")
    status = Column(String(20), nullable=False, default="completed")
    error = Column(Text, nullable=True)
    model = Column(String(100), nullable=True)
    prompt_tokens = Column(Integer, default=0, nullable=False)
    completion_tokens = Column(Integer, default=0, nullable=False)
    citations = Column(JSONB, default=list, nullable=False)


class DocumentChunk(TimestampMixin, Base):
    __tablename__ = "document_chunks"
    __table_args__ = (UniqueConstraint("source_type", "source_id", "chunk_index", "content_hash", name="uq_document_chunk_version"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_type = Column(String(50), nullable=False, index=True)
    source_id = Column(String(255), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    title = Column(String(500), nullable=False)
    content = Column(Text, nullable=False)
    content_hash = Column(String(64), nullable=False, index=True)
    source_url = Column(String(2048), nullable=True)
    source_metadata = Column(JSONB, default=dict, nullable=False)
    captured_at = Column(DateTime(timezone=True), nullable=True)
    search_vector = Column(TSVECTOR, nullable=True)
    embedding = Column(Vector(1536), nullable=True)
