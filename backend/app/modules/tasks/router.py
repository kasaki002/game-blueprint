from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.core.dependencies import CurrentUser
from app.workers.job_store import event_channel, get_job_state, open_redis

router = APIRouter(prefix="/api/tasks", tags=["tasks"])
TERMINAL = {"completed", "partial", "failed", "cancelled"}


@router.get("/{job_id}")
async def task_status(job_id: str, current_user: CurrentUser):
    redis = await open_redis()
    try:
        state = await get_job_state(redis, job_id)
    finally:
        await redis.aclose()
    if not state or state.get("owner_id") != str(current_user.id):
        raise HTTPException(404, "Task not found")
    return state


@router.get("/{job_id}/events")
async def task_events(job_id: str, request: Request, current_user: CurrentUser):
    redis = await open_redis()
    initial = await get_job_state(redis, job_id)
    if not initial or initial.get("owner_id") != str(current_user.id):
        await redis.aclose()
        raise HTTPException(404, "Task not found")

    async def stream():
        pubsub = redis.pubsub()
        await pubsub.subscribe(event_channel(job_id))
        try:
            yield f"event: snapshot\ndata: {json.dumps(initial, ensure_ascii=False)}\n\n"
            if initial.get("status") in TERMINAL:
                return
            while not await request.is_disconnected():
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message:
                    raw = message["data"].decode() if isinstance(message["data"], bytes) else message["data"]
                    state = json.loads(raw)
                    yield f"event: progress\ndata: {raw}\n\n"
                    if state.get("status") in TERMINAL:
                        return
                else:
                    yield ": heartbeat\n\n"
                    await asyncio.sleep(14)
        finally:
            await pubsub.unsubscribe(event_channel(job_id))
            await pubsub.aclose()
            await redis.aclose()

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
