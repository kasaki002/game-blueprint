"""Game analysis, persistent chat, export, and queued analysis APIs."""
from __future__ import annotations

import json
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response, StreamingResponse

from app.core.dependencies import CurrentUser, DbSession
from app.modules.analyze.schemas import AnalysisRequest, ChatMessageCreate, ChatSessionCreate, ChatSessionUpdate, ExportRequest
from app.modules.analyze.service import AnalyzeService
from app.workers.job_store import create_analysis_job, open_redis

router = APIRouter(prefix="/api/analyze", tags=["analyze"])
service = AnalyzeService()


@router.get("/reports")
async def list_reports(db: DbSession, current_user: CurrentUser, limit: int = Query(30, ge=1, le=100)):
    return await service.list_reports(db, current_user.id, limit)


@router.post("")
async def trigger_analysis(req: AnalysisRequest, db: DbSession, current_user: CurrentUser):
    result = await service.trigger_analysis(db, current_user.id, req.game_id, req.template_id, req.params)
    if result is None:
        raise HTTPException(404, "Game not found")
    return result


@router.post("/jobs", status_code=status.HTTP_202_ACCEPTED)
async def queue_analysis(req: AnalysisRequest, current_user: CurrentUser):
    redis = await open_redis()
    try:
        job_id = await create_analysis_job(redis, str(current_user.id), str(req.game_id), req.template_id, req.params)
    except Exception as exc:
        raise HTTPException(503, f"Analysis queue unavailable: {exc}") from exc
    finally:
        await redis.aclose()
    return {"job_id": job_id, "status": "queued"}


@router.get("/report/{report_id}")
async def get_report(report_id: UUID, db: DbSession, current_user: CurrentUser):
    report = await service.get_report(db, report_id, current_user.id)
    if not report:
        raise HTTPException(404, "Report not found")
    return report


@router.delete("/report/{report_id}", status_code=204)
async def delete_report(report_id: UUID, db: DbSession, current_user: CurrentUser):
    if not await service.delete_report(db, report_id, current_user.id):
        raise HTTPException(404, "Report not found")


@router.post("/{report_id}/export")
async def export_report(report_id: UUID, req: ExportRequest, db: DbSession, current_user: CurrentUser):
    fmt = req.format.lower()
    try:
        data = await service.export_report(db, report_id, current_user.id, fmt)
    except KeyError:
        raise HTTPException(404, "Report not found")
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    extension = "md" if fmt in {"md", "markdown"} else "json"
    media = "text/markdown" if extension == "md" else "application/json"
    return Response(data, media_type=media, headers={"Content-Disposition": f'attachment; filename="report-{report_id}.{extension}"'})


@router.get("/chat/sessions")
async def list_chat_sessions(db: DbSession, current_user: CurrentUser):
    return await service.list_chat_sessions(db, current_user.id)


@router.post("/chat/sessions", status_code=201)
async def create_chat_session(data: ChatSessionCreate, db: DbSession, current_user: CurrentUser):
    return await service.create_chat_session(db, current_user.id, data.title, data.game_id)


@router.patch("/chat/sessions/{session_id}")
async def rename_chat_session(session_id: UUID, data: ChatSessionUpdate, db: DbSession, current_user: CurrentUser):
    session = await service.get_chat_session(db, session_id, current_user.id)
    if not session:
        raise HTTPException(404, "Chat session not found")
    session.title = data.title
    await db.flush()
    await db.refresh(session)
    return service._chat_session(session)


@router.delete("/chat/sessions/{session_id}", status_code=204)
async def delete_chat_session(session_id: UUID, db: DbSession, current_user: CurrentUser):
    session = await service.get_chat_session(db, session_id, current_user.id)
    if not session:
        raise HTTPException(404, "Chat session not found")
    await db.delete(session)


@router.get("/chat/sessions/{session_id}/messages")
async def list_messages(session_id: UUID, db: DbSession, current_user: CurrentUser):
    messages = await service.list_messages(db, session_id, current_user.id)
    if messages is None:
        raise HTTPException(404, "Chat session not found")
    return messages


@router.post("/chat/sessions/{session_id}/messages", response_class=StreamingResponse)
async def send_message(session_id: UUID, data: ChatMessageCreate, db: DbSession, current_user: CurrentUser):
    session = await service.get_chat_session(db, session_id, current_user.id)
    if not session:
        raise HTTPException(404, "Chat session not found")

    async def events():
        full_content = ""
        async for chunk in service.chat_stream(db, session_id, current_user.id, data.message):
            full_content += chunk
            # Send each chunk as SSE
            yield f"data: {json.dumps({'content': chunk, 'done': False}, ensure_ascii=False)}\n\n"

        # Commit the transaction after streaming completes
        await db.commit()

        # Send final event with full message
        yield f"data: {json.dumps({'content': full_content, 'done': True}, ensure_ascii=False)}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")
