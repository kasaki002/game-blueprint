"""Redis-backed crawl job state and duplicate suppression."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from arq.connections import ArqRedis, RedisSettings, create_pool

from app.core.config import settings


def normalize_query(value: str) -> str:
    return " ".join(value.strip().casefold().split())


def redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(settings.redis_dsn)


def _state_key(job_id: str) -> str:
    return f"task:job:{job_id}"


def _event_channel(job_id: str) -> str:
    return f"task:events:{job_id}"


def _active_key(query: str, owner_id: str | None = None) -> str:
    digest = hashlib.sha256(f"{owner_id or 'public'}:{normalize_query(query)}".encode("utf-8")).hexdigest()
    return f"crawl:active:{digest}"


async def open_redis() -> ArqRedis:
    return await create_pool(redis_settings())


async def create_or_get_job(redis: ArqRedis, query: str, owner_id: str | None = None) -> tuple[str, bool]:
    active_key = _active_key(query, owner_id)
    existing = await redis.get(active_key)
    if existing:
        return existing.decode() if isinstance(existing, bytes) else str(existing), False

    job_id = uuid4().hex
    claimed = await redis.set(active_key, job_id, ex=settings.crawl_job_ttl, nx=True)
    if not claimed:
        existing = await redis.get(active_key)
        return existing.decode() if isinstance(existing, bytes) else str(existing), False

    await set_job_state(redis, job_id, {
        "job_id": job_id,
        "query": query.strip(),
        "kind": "crawl",
        "owner_id": owner_id,
        "status": "queued",
        "stage": "queued",
        "progress": 0,
        "result_count": 0,
        "game_ids": [],
        "warnings": [],
        "error": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    return job_id, True


async def enqueue_crawl_job(redis: ArqRedis, query: str, owner_id: str | None = None) -> tuple[str, bool, dict[str, Any]]:
    """Claim and enqueue a crawl, rolling back the claim on any enqueue failure."""
    job_id, created = await create_or_get_job(redis, query, owner_id)
    if not created:
        return job_id, False, await get_job_state(redis, job_id) or {"status": "queued"}

    try:
        queued = await redis.enqueue_job("crawl_game", query.strip(), job_id, _job_id=f"crawl-{job_id}")
        if queued is None:
            raise RuntimeError("The crawler queue rejected the job")
    except Exception as exc:
        state = await patch_job_state(
            redis,
            job_id,
            status="failed",
            stage="failed",
            progress=100,
            error=str(exc),
        )
        await release_job(redis, query, job_id)
        raise

    return job_id, True, await get_job_state(redis, job_id) or {"status": "queued"}


async def set_job_state(redis: ArqRedis, job_id: str, state: dict[str, Any]) -> None:
    state["updated_at"] = datetime.now(timezone.utc).isoformat()
    await redis.set(_state_key(job_id), json.dumps(state, ensure_ascii=False), ex=settings.crawl_job_ttl)
    if hasattr(redis, "publish"):
        await redis.publish(_event_channel(job_id), json.dumps(state, ensure_ascii=False))


async def patch_job_state(redis: ArqRedis, job_id: str, **changes: Any) -> dict[str, Any]:
    state = await get_job_state(redis, job_id) or {"job_id": job_id}
    state.update(changes)
    await set_job_state(redis, job_id, state)
    return state


async def get_job_state(redis: ArqRedis, job_id: str) -> dict[str, Any] | None:
    value = await redis.get(_state_key(job_id))
    if not value:
        return None
    if isinstance(value, bytes):
        value = value.decode("utf-8")
    return json.loads(value)


async def release_job(redis: ArqRedis, query: str, job_id: str, owner_id: str | None = None) -> None:
    key = _active_key(query, owner_id)
    await redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then "
        "return redis.call('del', KEYS[1]) else return 0 end",
        1,
        key,
        job_id,
    )


async def create_analysis_job(redis: ArqRedis, owner_id: str, game_id: str, template_id: str, params: dict[str, Any]) -> str:
    job_id = uuid4().hex
    await set_job_state(redis, job_id, {
        "job_id": job_id, "kind": "analysis", "owner_id": owner_id,
        "status": "queued", "stage": "queued", "progress": 0,
        "game_id": game_id, "template_id": template_id, "params": params,
        "report_id": None, "error": None, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    queued = await redis.enqueue_job("analyze_game", owner_id, game_id, template_id, params, job_id, _job_id=f"analysis-{job_id}")
    if queued is None:
        await patch_job_state(redis, job_id, status="failed", stage="failed", progress=100, error="Analysis queue rejected the job")
        raise RuntimeError("Analysis queue rejected the job")
    return job_id


def event_channel(job_id: str) -> str:
    return _event_channel(job_id)
