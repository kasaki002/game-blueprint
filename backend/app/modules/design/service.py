"""Game Design - Business logic."""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.design import DesignProject


class DesignService:
    """Design project CRUD and canvas persistence."""

    async def list_projects(self, db: AsyncSession, user_id: UUID) -> list[dict]:
        rows = await db.scalars(
            select(DesignProject)
            .where(DesignProject.user_id == user_id)
            .order_by(DesignProject.updated_at.desc())
        )
        return [self._project(project) for project in rows]

    async def get_project(self, db: AsyncSession, project_id: UUID, user_id: UUID) -> dict | None:
        project = await db.scalar(select(DesignProject).where(DesignProject.id == project_id, DesignProject.user_id == user_id))
        return self._project(project) if project else None

    async def create_project(self, db: AsyncSession, user_id: UUID, data: dict) -> dict:
        project = DesignProject(user_id=user_id, **data)
        db.add(project)
        await db.flush()
        await db.refresh(project)
        return self._project(project)

    async def update_project(self, db: AsyncSession, project_id: UUID, user_id: UUID, data: dict) -> dict | None:
        project = await db.scalar(select(DesignProject).where(DesignProject.id == project_id, DesignProject.user_id == user_id))
        if project is None:
            return None
        for key, value in data.items():
            setattr(project, key, value)
        await db.flush()
        await db.refresh(project)
        return self._project(project)

    async def delete_project(self, db: AsyncSession, project_id: UUID, user_id: UUID) -> bool:
        project = await db.scalar(select(DesignProject).where(DesignProject.id == project_id, DesignProject.user_id == user_id))
        if project is None:
            return False
        await db.delete(project)
        return True

    async def get_recommendations(self, db: AsyncSession, project_id: UUID, user_id: UUID, node_type: str) -> list[dict]:
        if not await db.scalar(select(DesignProject.id).where(DesignProject.id == project_id, DesignProject.user_id == user_id)):
            return []
        labels = {
            "character": ["定义角色动机与成长弧", "为核心技能设计明确代价"],
            "mechanic": ["先写出可执行规则", "用最小原型验证反馈循环"],
            "level": ["用地标引导路线", "把难度变化绑定到新机制教学"],
        }
        return [
            {"title": title, "node_type": node_type or "reference", "source": "内置设计知识库"}
            for title in labels.get(node_type, ["明确该节点服务的核心体验", "补充输入、规则与反馈"])
        ]

    @staticmethod
    def _project(project: DesignProject) -> dict:
        return {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "source_note_id": project.source_note_id,
            "canvas_state": project.canvas_state or {},
            "revision": project.revision,
            "created_at": project.created_at.isoformat(),
            "updated_at": project.updated_at.isoformat(),
        }
