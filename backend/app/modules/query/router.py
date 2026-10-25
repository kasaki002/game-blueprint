"""Game Query - API routes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from app.core.dependencies import CurrentUser, DbSession
from app.modules.query.schemas import (
    CrawlQueuedResponse, CrawlRequest, CrawlStatusResponse, GameDetail, SearchResponse,
)
from app.modules.query.service import QueryService
from app.workers.job_store import enqueue_crawl_job, get_job_state, open_redis

router = APIRouter(prefix="/api/query", tags=["query"])
service = QueryService()


@router.post("/crawl", response_model=CrawlQueuedResponse, status_code=status.HTTP_202_ACCEPTED)
async def queue_crawl(request: CrawlRequest, current_user: CurrentUser):
    try:
        redis = await open_redis()
        job_id, created, state = await enqueue_crawl_job(redis, request.q, str(current_user.id))
        return {"job_id": job_id, "status": (state or {}).get("status", "queued"), "created": created}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Crawler queue unavailable: {exc}")
    finally:
        if "redis" in locals():
            await redis.aclose()


@router.get("/crawl/{job_id}", response_model=CrawlStatusResponse)
async def crawl_status(job_id: str, current_user: CurrentUser):
    try:
        redis = await open_redis()
        state = await get_job_state(redis, job_id)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Crawler status unavailable: {exc}")
    finally:
        if "redis" in locals():
            await redis.aclose()
    if state is None:
        raise HTTPException(status_code=404, detail="Crawl job not found or expired")
    if state.get("owner_id") != str(current_user.id):
        raise HTTPException(status_code=404, detail="Crawl job not found or expired")
    return state


@router.get("", response_model=SearchResponse)
async def search_games(
    db: DbSession,
    q: str = Query(min_length=1),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    result = await service.search(db, q, page, page_size)
    return result


@router.get("/{game_id}", response_model=GameDetail)
async def get_game_detail(game_id: str, db: DbSession):
    detail = await service.get_detail(db, game_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Game not found")
    return detail
