"""Inspiration - Business logic."""
from __future__ import annotations

from datetime import timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import User
from app.models.design import DesignProject
from app.models.inspiration import InspirationNote


class InspirationService:
    """CRUD and AI-deepen for inspiration notes."""

    async def list_notes(self, db: AsyncSession, user_id: UUID, tag: str | None = None) -> list[dict]:
        statement = select(InspirationNote).where(InspirationNote.user_id == user_id)
        if tag:
            statement = statement.where(InspirationNote.tags.any(tag))
        rows = await db.scalars(statement.order_by(InspirationNote.updated_at.desc()))
        return [self._serialize(note) for note in rows]

    async def get_note(self, db: AsyncSession, note_id: UUID, user_id: UUID) -> dict | None:
        note = await db.scalar(select(InspirationNote).where(InspirationNote.id == note_id, InspirationNote.user_id == user_id))
        return self._serialize(note) if note else None

    async def create_note(self, db: AsyncSession, user_id: UUID, data: dict) -> dict:
        note = InspirationNote(user_id=user_id, **data)
        db.add(note)
        await db.flush()
        await db.refresh(note)
        return self._serialize(note)

    async def update_note(self, db: AsyncSession, note_id: UUID, user_id: UUID, data: dict) -> dict | None:
        note = await db.scalar(select(InspirationNote).where(InspirationNote.id == note_id, InspirationNote.user_id == user_id))
        if note is None:
            return None
        for key, value in data.items():
            setattr(note, key, value)
        await db.flush()
        await db.refresh(note)
        return self._serialize(note)

    async def delete_note(self, db: AsyncSession, note_id: UUID, user_id: UUID) -> bool:
        note = await db.scalar(select(InspirationNote).where(InspirationNote.id == note_id, InspirationNote.user_id == user_id))
        if note is None:
            return False
        await db.delete(note)
        return True

    async def ai_deepen(self, db: AsyncSession, note_id: UUID, user_id: UUID, message: str) -> str | None:
        note = await db.scalar(select(InspirationNote).where(InspirationNote.id == note_id, InspirationNote.user_id == user_id))
        if note is None:
            return None
        response = (
            f"围绕“{note.title}”，建议先明确核心体验，再把“{message}”拆成规则、反馈、"
            "风险与验证指标四部分。下一步可创建机制节点，并用一个最小关卡验证它是否有趣。"
        )
        conversation = list(note.ai_conversation or [])
        conversation.extend([{"role": "user", "content": message}, {"role": "assistant", "content": response}])
        note.ai_conversation = conversation
        await db.flush()
        return response

    async def convert_to_project(self, db: AsyncSession, note_id: UUID, user_id: UUID) -> dict | None:
        note = await db.scalar(select(InspirationNote).where(InspirationNote.id == note_id, InspirationNote.user_id == user_id))
        if note is None:
            return None
        existing = await db.scalar(
            select(DesignProject).where(DesignProject.source_note_id == note.id, DesignProject.user_id == user_id)
        )
        if existing is not None:
            return {"id": existing.id, "name": existing.name, "project_id": existing.id}
        project = DesignProject(
            user_id=note.user_id,
            name=note.title,
            description=note.description,
            source_note_id=note.id,
            canvas_state={"nodes": [], "edges": []},
        )
        db.add(project)
        await db.flush()
        await db.refresh(project)
        return {"id": project.id, "name": project.name, "project_id": project.id}

    @staticmethod
    def _serialize(note: InspirationNote) -> dict:
        return {
            "id": note.id,
            "title": note.title,
            "tags": note.tags or [],
            "description": note.description,
            "related_games": note.related_games or [],
            "ai_conversation": note.ai_conversation or [],
            "created_at": note.created_at.isoformat(),
            "updated_at": note.updated_at.isoformat(),
        }
