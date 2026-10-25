"""ARQ worker entrypoint for immediate and scheduled game collection."""
from __future__ import annotations

import logging

from arq import Retry, cron
from sqlalchemy import select

from app.core.database import async_session_factory, close_databases, initialize_database
from app.models.game import GameMetadata
from app.workers.job_store import enqueue_crawl_job, get_job_state, patch_job_state, redis_settings, release_job
from app.workers.pipeline import CrawlPipeline
from app.modules.analyze.service import AnalyzeService

logger = logging.getLogger(__name__)


async def crawl_game(ctx: dict, query: str, job_id: str) -> dict:
    redis = ctx["redis"]
    job_try = int(ctx.get("job_try", 1))
    await patch_job_state(redis, job_id, status="running", stage="starting", progress=5, error=None)

    async def progress(stage: str, value: int) -> None:
        await patch_job_state(redis, job_id, status="running", stage=stage, progress=value)

    try:
        result = await CrawlPipeline().run(query, progress)
        state = await patch_job_state(
            redis,
            job_id,
            status=result.status,
            stage="completed" if result.status != "failed" else "failed",
            progress=100,
            result_count=len(result.game_ids),
            game_ids=result.game_ids,
            warnings=result.warnings,
            error="; ".join(result.warnings) if result.status == "failed" else None,
        )
        return state
    except Exception as exc:
        await patch_job_state(
            redis,
            job_id,
            status="failed" if job_try >= WorkerSettings.max_tries else "running",
            stage="failed" if job_try >= WorkerSettings.max_tries else "retrying",
            progress=100 if job_try >= WorkerSettings.max_tries else 5,
            error=str(exc),
        )
        if job_try < WorkerSettings.max_tries:
            raise Retry(defer=min(2 ** job_try, 10))
        raise
    finally:
        if job_try >= WorkerSettings.max_tries or "result" in locals():
            state = await get_job_state(redis, job_id)
            await release_job(redis, query, job_id, (state or {}).get("owner_id"))


async def analyze_game(ctx: dict, owner_id: str, game_id: str, template_id: str, params: dict, job_id: str) -> dict:
    from uuid import UUID
    redis = ctx["redis"]
    await patch_job_state(redis, job_id, status="running", stage="retrieving", progress=15, error=None)
    try:
        async with async_session_factory() as session:
            await patch_job_state(redis, job_id, stage="generating", progress=55)
            result = await AnalyzeService().trigger_analysis(session, UUID(owner_id), UUID(game_id), template_id, params)
            if not result:
                raise ValueError("Game not found")
            await session.commit()
        return await patch_job_state(redis, job_id, status="completed", stage="completed", progress=100, report_id=result["report_id"])
    except Exception as exc:
        await patch_job_state(redis, job_id, status="failed", stage="failed", progress=100, error=str(exc))
        raise


async def refresh_cached_games(ctx: dict) -> None:
    """Queue a weekly refresh for the existing catalog without duplicating active jobs."""
    redis = ctx["redis"]
    async with async_session_factory() as session:
        names = list(await session.scalars(select(GameMetadata.name).order_by(GameMetadata.updated_at.asc()).limit(100)))
    queued = 0
    failed = 0
    for name in names:
        try:
            await enqueue_crawl_job(redis, name)
            queued += 1
        except Exception as exc:
            failed += 1
            logger.warning("Scheduled refresh failed for %s: %s", name, exc)
    logger.info("Scheduled catalog refresh finished: queued=%s failed=%s", queued, failed)


async def startup(_ctx: dict) -> None:
    await initialize_database()


async def shutdown(_ctx: dict) -> None:
    await close_databases()


class WorkerSettings:
    functions = [crawl_game, analyze_game, refresh_cached_games]
    cron_jobs = [cron(refresh_cached_games, weekday=6, hour=3, minute=0)]
    redis_settings = redis_settings()
    on_startup = startup
    on_shutdown = shutdown
    max_tries = 3
    retry_jobs = True
    job_timeout = 180
    keep_result = 86400
    health_check_interval = 30
