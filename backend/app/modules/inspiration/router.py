"""Inspiration - API routes."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.modules.inspiration.schemas import NoteCreate, NoteUpdate, NoteResponse, AiDeepenRequest
from app.modules.inspiration.service import InspirationService
from app.core.dependencies import CurrentUser, DbSession

router = APIRouter(prefix="/api/inspiration", tags=["inspiration"])
service = InspirationService()


@router.get("", response_model=list[NoteResponse])
async def list_notes(db: DbSession, current_user: CurrentUser, tag: str | None = Query(None)):
    return await service.list_notes(db, current_user.id, tag=tag)


@router.post("", response_model=NoteResponse, status_code=201)
async def create_note(data: NoteCreate, db: DbSession, current_user: CurrentUser):
    return await service.create_note(db, current_user.id, data.model_dump())


@router.get("/{note_id}", response_model=NoteResponse)
async def get_note(note_id: UUID, db: DbSession, current_user: CurrentUser):
    note = await service.get_note(db, note_id, current_user.id)
    if not note:
        raise HTTPException(404, "Note not found")
    return note


@router.patch("/{note_id}", response_model=NoteResponse)
async def update_note(note_id: UUID, data: NoteUpdate, db: DbSession, current_user: CurrentUser):
    note = await service.update_note(db, note_id, current_user.id, data.model_dump(exclude_unset=True))
    if not note:
        raise HTTPException(404, "Note not found")
    return note


@router.delete("/{note_id}", status_code=204)
async def delete_note(note_id: UUID, db: DbSession, current_user: CurrentUser):
    if not await service.delete_note(db, note_id, current_user.id):
        raise HTTPException(404, "Note not found")


@router.post("/{note_id}/convert")
async def convert_to_project(note_id: UUID, db: DbSession, current_user: CurrentUser):
    project = await service.convert_to_project(db, note_id, current_user.id)
    if project is None:
        raise HTTPException(404, "Note not found")
    return project


@router.post("/{note_id}/ai")
async def ai_deepen(note_id: UUID, req: AiDeepenRequest, db: DbSession, current_user: CurrentUser):
    response = await service.ai_deepen(db, note_id, current_user.id, req.message)
    if response is None:
        raise HTTPException(404, "Note not found")
    return {"response": response}
