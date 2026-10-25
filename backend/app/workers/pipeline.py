"""Normalize, merge and persist game data collected from external sources."""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

import httpx
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.config import settings
from app.core.database import async_session_factory, get_mongo_db
from app.models.game import GameMetadata, GameSource
from app.engine.indexing import index_game, index_raw_document
from app.workers.normalize import merge_records
from app.workers.sources import SourceError, SourceRecord, SteamBrowserSource, SteamSource, WikipediaSource

ProgressCallback = Callable[[str, int], Awaitable[None]]


@dataclass
class CrawlResult:
    status: str
    game_ids: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class CrawlPipeline:
    async def run(self, query: str, progress: ProgressCallback) -> CrawlResult:
        timeout = httpx.Timeout(settings.crawl_timeout)
        proxies = settings.proxy_pool[0] if settings.proxy_pool else None
        records: list[SourceRecord] = []
        warnings: list[str] = []
        async with httpx.AsyncClient(
            timeout=timeout,
            follow_redirects=True,
            proxy=proxies,
            headers={
                "User-Agent": settings.crawler_user_agent,
                "Accept": "application/json",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
            },
        ) as client:
            await progress("steam", 15)
            try:
                steam = SteamSource(client)
                steam_records = await steam.search(query)
                if settings.browser_crawl_enabled:
                    browser_source = SteamBrowserSource()
                    for record in steam_records:
                        if browser_source.needs_fallback(record):
                            try:
                                record = await browser_source.enrich(record)
                            except Exception as exc:
                                warnings.append(f"Steam browser {record.external_id}: {exc}")
                        records.append(record)
                else:
                    records.extend(steam_records)
                warnings.extend(steam.warnings)
            except SourceError as exc:
                warnings.append(f"{exc.provider}: {exc}")
                if settings.browser_crawl_enabled:
                    try:
                        browser_source = SteamBrowserSource()
                        for record in await browser_source.search(query):
                            records.append(await browser_source.enrich(record))
                    except Exception as browser_exc:
                        warnings.append(f"Steam browser search: {browser_exc}")

            await progress("wikipedia", 45)
            try:
                wikipedia = WikipediaSource(client)
                records.extend(await wikipedia.search(query))
                warnings.extend(wikipedia.warnings)
            except SourceError as exc:
                warnings.append(f"{exc.provider}: {exc}")

        if not records:
            return CrawlResult(status="failed", warnings=warnings or ["No source returned a matching game"])

        await progress("merging", 65)
        games = merge_records(records, query)
        # Limit persistence to the strongest cross-source candidate. This avoids
        # caching loosely related search results as separate games.
        games = games[:1]
        await progress("persisting", 80)
        game_ids = await self.persist(games, query, warnings)
        return CrawlResult(status="partial" if warnings else "completed", game_ids=game_ids, warnings=warnings)

    async def persist(self, games: list[dict[str, Any]], query: str, warnings: list[str]) -> list[str]:
        game_ids: list[str] = []
        raw_documents = []
        async with async_session_factory() as session:
            for payload in games:
                for lock_key in sorted(
                    f"{source['provider']}:{source['external_id']}" for source in payload["sources"]
                ):
                    await session.execute(select(func.pg_advisory_xact_lock(func.hashtextextended(lock_key, 0))))
                source_rows = []
                for source in payload["sources"]:
                    row = await session.scalar(select(GameSource).where(
                        GameSource.provider == source["provider"],
                        GameSource.external_id == source["external_id"],
                    ))
                    if row:
                        source_rows.append(row)

                game = await session.get(GameMetadata, source_rows[0].game_id) if source_rows else None
                if game is None:
                    candidate_names = {
                        str(name).strip() for name in [payload["name"], *payload["aliases"]]
                        if str(name).strip()
                    }
                    normalized_names = [name.casefold() for name in candidate_names]
                    game = await session.scalar(
                        select(GameMetadata).where(
                            (func.lower(GameMetadata.name).in_(normalized_names))
                            | GameMetadata.aliases.op("&&")(list(candidate_names))
                        ).limit(1)
                    )
                if game is None:
                    game = GameMetadata(name=payload["name"])
                    session.add(game)
                    await session.flush()

                for field_name in (
                    "aliases", "genres", "developers", "publishers", "release_date", "platforms",
                    "summary", "cover_url", "ratings", "sources", "media",
                ):
                    value = payload[field_name]
                    if field_name == "aliases":
                        value = sorted(set(game.aliases or []) | set(value or []))
                    if value not in (None, [], ""):
                        setattr(game, field_name, value)

                for record in payload["records"]:
                    raw_json = json.dumps(record.raw, ensure_ascii=False, sort_keys=True, default=str)
                    content_hash = hashlib.sha256(raw_json.encode("utf-8")).hexdigest()
                    crawled_at = datetime.now(timezone.utc)
                    await session.execute(
                        pg_insert(GameSource)
                        .values(
                            game_id=game.id,
                            provider=record.provider,
                            external_id=record.external_id,
                            url=record.url,
                            content_hash=content_hash,
                            last_crawled_at=crawled_at,
                        )
                        .on_conflict_do_update(
                            index_elements=[GameSource.provider, GameSource.external_id],
                            set_={
                                "url": record.url,
                                "content_hash": content_hash,
                                "last_crawled_at": crawled_at,
                            },
                        )
                    )
                    raw_documents.append({
                        "provider": record.provider,
                        "external_id": record.external_id,
                        "game_id": str(game.id),
                        "query": query,
                        "url": record.url,
                        "content_hash": content_hash,
                        "crawled_at": datetime.now(timezone.utc),
                        "raw": record.raw,
                    })
                    await index_raw_document(session, record.provider, record.external_id, game.name, record.url, raw_json, crawled_at)
                game_ids.append(str(game.id))
                await index_game(session, game.id)
            await session.commit()

        try:
            mongo = await get_mongo_db()
            if raw_documents:
                for document in raw_documents:
                    await mongo.game_raw_data.replace_one(
                        {
                            "provider": document["provider"],
                            "external_id": document["external_id"],
                            "content_hash": document["content_hash"],
                        },
                        document,
                        upsert=True,
                    )
        except Exception as exc:
            warnings.append(f"mongodb: {exc}")
        return game_ids
