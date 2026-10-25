"""Game Design - Pydantic schemas."""
from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    source_note_id: UUID | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class ProjectResponse(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    source_note_id: UUID | None = None
    canvas_state: dict = Field(default_factory=dict)
    revision: int = 0
    created_at: str
    updated_at: str


class CanvasSave(BaseModel):
    workspace: dict
    base_revision: int = Field(ge=0)


class CanvasResponse(BaseModel):
    workspace: dict = Field(default_factory=dict)
    revision: int
    updated_at: str
