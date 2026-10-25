import asyncio

import httpx
import pytest

from app.workers.sources import HttpSource, SourceError


class ExampleSource(HttpSource):
    provider = "test"


def test_retries_after_rate_limit(monkeypatch):
    calls = 0

    async def handler(request):
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(429, headers={"Retry-After": "0"})
        return httpx.Response(200, json={"ok": True})

    monkeypatch.setattr("app.workers.sources.settings.crawl_delay", 0)
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await ExampleSource(client).get_json("https://example.test")

    assert asyncio.run(run()) == {"ok": True}
    assert calls == 2


def test_non_json_response_becomes_source_error(monkeypatch):
    async def handler(request):
        return httpx.Response(200, text="not-json")

    monkeypatch.setattr("app.workers.sources.settings.crawl_max_retries", 1)
    monkeypatch.setattr("app.workers.sources.settings.crawl_delay", 0)
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await ExampleSource(client).get_json("https://example.test")

    with pytest.raises(SourceError) as error:
        asyncio.run(run())
    assert error.value.provider == "test"


def test_timeout_becomes_source_error(monkeypatch):
    async def handler(request):
        raise httpx.ReadTimeout("timed out", request=request)

    monkeypatch.setattr("app.workers.sources.settings.crawl_max_retries", 1)
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await ExampleSource(client).get_json("https://example.test")

    with pytest.raises(SourceError, match="timed out"):
        asyncio.run(run())


def test_client_error_is_not_retried(monkeypatch):
    calls = 0

    async def handler(request):
        nonlocal calls
        calls += 1
        return httpx.Response(404, request=request, json={"detail": "missing"})

    monkeypatch.setattr("app.workers.sources.settings.crawl_max_retries", 3)
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await ExampleSource(client).get_json("https://example.test/missing")

    with pytest.raises(SourceError, match="404"):
        asyncio.run(run())
    assert calls == 1
