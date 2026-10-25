import asyncio

import pytest

from app.workers import job_store


class FakeRedis:
    def __init__(self):
        self.values = {}

    async def get(self, key):
        return self.values.get(key)

    async def set(self, key, value, ex=None, nx=False):
        if nx and key in self.values:
            return False
        self.values[key] = value
        return True

    async def delete(self, key):
        self.values.pop(key, None)

    async def eval(self, script, count, key, job_id):
        active = self.values.get(key)
        if active == job_id:
            self.values.pop(key, None)
            return 1
        return 0

    async def enqueue_job(self, *args, **kwargs):
        return object()


def test_duplicate_query_reuses_active_job():
    async def run():
        redis = FakeRedis()
        first, created = await job_store.create_or_get_job(redis, "Elden Ring")
        second, created_again = await job_store.create_or_get_job(redis, " elden  ring ")
        return first, created, second, created_again

    first, created, second, created_again = asyncio.run(run())
    assert created is True
    assert created_again is False
    assert first == second


def test_job_state_patch_keeps_existing_fields():
    async def run():
        redis = FakeRedis()
        job_id, _ = await job_store.create_or_get_job(redis, "Portal")
        return await job_store.patch_job_state(redis, job_id, status="running", progress=45)

    state = asyncio.run(run())
    assert state["query"] == "Portal"
    assert state["status"] == "running"
    assert state["progress"] == 45


def test_enqueue_failure_releases_active_claim():
    class RejectingRedis(FakeRedis):
        async def enqueue_job(self, *args, **kwargs):
            raise RuntimeError("queue unavailable")

    async def run():
        redis = RejectingRedis()
        with pytest.raises(RuntimeError, match="queue unavailable"):
            await job_store.enqueue_crawl_job(redis, "Portal")
        return await job_store.create_or_get_job(redis, "Portal")

    job_id, created = asyncio.run(run())
    assert created is True
