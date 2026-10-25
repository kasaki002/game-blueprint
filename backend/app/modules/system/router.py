"""Cross-module endpoints defined by the system design document."""
from __future__ import annotations

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select

from app.core.dependencies import CurrentUser, DbSession
from app.engine.retrieval import HybridRetriever
from app.models.design import DesignProject
from app.models.game import GameMetadata
from app.models.inspiration import InspirationNote

router = APIRouter(prefix="/api", tags=["system"])


class RetrieveRequest(BaseModel):
    query: str
    top_k: int = Field(5, ge=1, le=20)


@router.get("/search")
async def global_search(db: DbSession, current_user: CurrentUser, q: str = Query(min_length=1)):
    keyword = q.strip()
    term = f"%{keyword}%"
    games = await db.scalars(
        select(GameMetadata).where(or_(
            GameMetadata.name.ilike(term), GameMetadata.summary.ilike(term),
            func.array_to_string(GameMetadata.aliases, ' ').ilike(term),
            func.array_to_string(GameMetadata.genres, ' ').ilike(term),
            func.array_to_string(GameMetadata.developers, ' ').ilike(term),
            func.array_to_string(GameMetadata.publishers, ' ').ilike(term),
            func.array_to_string(GameMetadata.platforms, ' ').ilike(term),
        )).limit(10)
    )
    notes = await db.scalars(
        select(InspirationNote).where(
            InspirationNote.user_id == current_user.id,
            or_(InspirationNote.title.ilike(term), InspirationNote.description.ilike(term), InspirationNote.tags.any(keyword)),
        ).limit(10)
    )
    projects = await db.scalars(
        select(DesignProject).where(DesignProject.user_id == current_user.id, or_(DesignProject.name.ilike(term), DesignProject.description.ilike(term))).limit(10)
    )
    return {
        "games": [{"id": item.id, "title": item.name, "summary": item.summary, "type": "game"} for item in games],
        "inspirations": [{"id": item.id, "title": item.title, "summary": item.description, "type": "inspiration"} for item in notes],
        "projects": [{"id": item.id, "title": item.name, "summary": item.description, "type": "project"} for item in projects],
    }


@router.post("/rag/retrieve")
async def retrieve_context(request: RetrieveRequest, db: DbSession, _current_user: CurrentUser):
    documents = await HybridRetriever().search(db, request.query, request.top_k)
    return {"query": request.query, "documents": documents, "count": len(documents)}


@router.post("/export")
async def export_payload(payload: dict):
    """Generic JSON export endpoint for cross-module client data."""
    return {"format": payload.get("format", "json"), "data": payload.get("data", payload)}
