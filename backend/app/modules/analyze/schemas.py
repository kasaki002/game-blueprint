"""Game Analysis - Pydantic schemas."""
from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class AnalysisRequest(BaseModel):
    game_id: UUID
    template_id: str  # char-tier | build-recommend | boss-guide | story-deep | mechanic
    params: dict = Field(default_factory=dict)


class ChatRequest(BaseModel):
    game_id: UUID | None = None
    message: str
    session_id: str | None = None


class ChatSessionCreate(BaseModel):
    title: str = Field(default="新对话", min_length=1, max_length=255)
    game_id: UUID | None = None


class ChatSessionUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=255)


class ChatMessageCreate(BaseModel):
    message: str = Field(min_length=1, max_length=20000)


class AnalysisReport(BaseModel):
    id: str
    game_id: UUID
    report_type: str
    content: str
    charts_data: list[dict] = Field(default_factory=list)
    citations: list[dict] = Field(default_factory=list)


class AnalysisReportSummary(BaseModel):
    id: UUID
    game_id: UUID
    game_name: str
    report_type: str
    excerpt: str
    created_at: str
    updated_at: str


class ExportRequest(BaseModel):
    report_id: str | None = None
    format: str  # markdown | md | json
