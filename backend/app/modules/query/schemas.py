"""Game Query - Pydantic schemas."""
from __future__ import annotations

from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    q: str
    page: int = 1
    page_size: int = 20


class GameSummary(BaseModel):
    id: UUID
    name: str
    aliases: list[str] = Field(default_factory=list)
    genres: list[str] = Field(default_factory=list)
    developers: list[str] = Field(default_factory=list)
    release_date: date | None = None
    cover_url: str | None = None
    summary: str | None = None


class GameDetail(GameSummary):
    publishers: list[str] = Field(default_factory=list)
    platforms: list[str] = Field(default_factory=list)
    ratings: list[dict] = Field(default_factory=list)
    sources: list[dict] = Field(default_factory=list)
    media: list[dict] = Field(default_factory=list)


class SearchResponse(BaseModel):
    results: list[GameSummary]
    total: int
    page: int
    page_size: int


class CrawlRequest(BaseModel):
    q: str = Field(min_length=1, max_length=255)


class CrawlQueuedResponse(BaseModel):
    job_id: str
    status: str
    created: bool


class CrawlStatusResponse(BaseModel):
    job_id: str
    query: str
    status: str
    stage: str
    progress: int
    result_count: int
    game_ids: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    error: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
