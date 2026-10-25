"""Game Design - API routes."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DbSession
from app.models.design import DesignProject
from app.modules.design.schemas import (
    CanvasResponse, CanvasSave, ProjectCreate, ProjectResponse, ProjectUpdate,
)
from app.modules.design.service import DesignService

router = APIRouter(prefix="/api/design", tags=["design"])
service = DesignService()


@router.get("/projects", response_model=list[ProjectResponse])
async def list_projects(db: DbSession, current_user: CurrentUser):
    return await service.list_projects(db, current_user.id)


@router.post("/projects", response_model=ProjectResponse, status_code=201)
async def create_project(data: ProjectCreate, db: DbSession, current_user: CurrentUser):
    return await service.create_project(db, current_user.id, data.model_dump())


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: UUID, db: DbSession, current_user: CurrentUser):
    proj = await service.get_project(db, project_id, current_user.id)
    if not proj:
        raise HTTPException(404, "Project not found")
    return proj


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: UUID, data: ProjectUpdate, db: DbSession, current_user: CurrentUser):
    proj = await service.update_project(db, project_id, current_user.id, data.model_dump(exclude_unset=True))
    if not proj:
        raise HTTPException(404, "Project not found")
    return proj


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(project_id: UUID, db: DbSession, current_user: CurrentUser):
    if not await service.delete_project(db, project_id, current_user.id):
        raise HTTPException(404, "Project not found")


@router.post("/projects/{project_id}/recommend")
async def get_recommendations(project_id: UUID, db: DbSession, current_user: CurrentUser, node_type: str = ""):
    recs = await service.get_recommendations(db, project_id, current_user.id, node_type)
    return {"recommendations": recs}


@router.get("/projects/{project_id}/canvas", response_model=CanvasResponse)
async def get_canvas(project_id: UUID, db: DbSession, current_user: CurrentUser):
    project = await service.get_project(db, project_id, current_user.id)
    if not project:
        raise HTTPException(404, "Project not found")
    return {"workspace": project["canvas_state"], "revision": project["revision"], "updated_at": project["updated_at"]}


@router.put("/projects/{project_id}/canvas", response_model=CanvasResponse)
async def save_canvas(project_id: UUID, data: CanvasSave, db: DbSession, current_user: CurrentUser):
    project = await db.scalar(select(DesignProject).where(DesignProject.id == project_id, DesignProject.user_id == current_user.id).with_for_update())
    if not project:
        raise HTTPException(404, "Project not found")
    if project.revision != data.base_revision:
        raise HTTPException(409, detail={"message": "Canvas revision conflict", "workspace": project.canvas_state or {}, "revision": project.revision, "updated_at": project.updated_at.isoformat()})
    project.canvas_state = data.workspace
    project.revision += 1
    await db.flush()
    await db.refresh(project)
    return {"workspace": project.canvas_state or {}, "revision": project.revision, "updated_at": project.updated_at.isoformat()}
