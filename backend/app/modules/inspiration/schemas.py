"""Inspiration - Pydantic schemas."""
from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class NoteCreate(BaseModel):
    title: str
    tags: list[str] = Field(default_factory=list)
    description: str | None = None
    related_games: list[UUID] = Field(default_factory=list)


class NoteUpdate(BaseModel):
    title: str | None = None
    tags: list[str] | None = None
    description: str | None = None
    related_games: list[UUID] | None = None


class NoteResponse(BaseModel):
    id: UUID
    title: str
    tags: list[str] = Field(default_factory=list)
    description: str | None = None
    related_games: list[UUID] = Field(default_factory=list)
    ai_conversation: list[dict] = Field(default_factory=list)
    created_at: str
    updated_at: str


class AiDeepenRequest(BaseModel):
    note_id: UUID
    message: str
