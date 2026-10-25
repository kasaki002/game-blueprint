import asyncio

import pytest

from app.workers.sources import SourceError, SteamSource


def test_steam_keeps_successful_candidate_when_later_detail_fails(monkeypatch):
    source = SteamSource(client=None)
    calls = 0

    async def fake_get_json(url, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            return {"items": [{"id": 1}, {"id": 2}]}
        if calls == 2:
            return {"1": {"success": True, "data": {"name": "Game One", "type": "game"}}}
        raise SourceError("steam", "detail timeout")

    monkeypatch.setattr(source, "get_json", fake_get_json)
    records = asyncio.run(source.search("Game"))
    assert [record.external_id for record in records] == ["1"]
    assert source.warnings == ["Steam app 2: detail timeout"]
