"""HTTP adapters for public game data sources."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any
from urllib.parse import quote

import httpx

from app.core.config import settings

_browser_semaphore = asyncio.Semaphore(settings.browser_crawl_concurrency)


class SourceError(RuntimeError):
    def __init__(self, provider: str, message: str):
        super().__init__(message)
        self.provider = provider


@dataclass
class SourceRecord:
    provider: str
    external_id: str
    url: str
    raw: dict[str, Any]
    name: str
    aliases: list[str] = field(default_factory=list)
    genres: list[str] = field(default_factory=list)
    developers: list[str] = field(default_factory=list)
    publishers: list[str] = field(default_factory=list)
    release_date: date | None = None
    platforms: list[str] = field(default_factory=list)
    summary: str | None = None
    cover_url: str | None = None
    ratings: list[dict[str, Any]] = field(default_factory=list)
    media: list[dict[str, Any]] = field(default_factory=list)


class HttpSource:
    provider = "unknown"

    def __init__(self, client: httpx.AsyncClient):
        self.client = client
        self.warnings: list[str] = []

    async def get_json(self, url: str, **kwargs: Any) -> dict[str, Any]:
        last_error = "request failed"
        for attempt in range(settings.crawl_max_retries):
            try:
                response = await self.client.get(url, **kwargs)
                if response.status_code == 429 or response.status_code >= 500:
                    last_error = f"HTTP {response.status_code} for {response.request.url}"
                    try:
                        retry_after = min(float(response.headers.get("Retry-After", attempt + 1)), 8.0)
                    except ValueError:
                        retry_after = min(2 ** attempt, 8.0)
                    await asyncio.sleep(retry_after)
                    continue
                response.raise_for_status()
                payload = response.json()
                if not isinstance(payload, dict):
                    raise ValueError("response is not a JSON object")
                if settings.crawl_delay:
                    await asyncio.sleep(settings.crawl_delay)
                return payload
            except (httpx.HTTPError, ValueError) as exc:
                last_error = str(exc)
                if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code < 500:
                    raise SourceError(self.provider, last_error) from exc
                if attempt + 1 < settings.crawl_max_retries:
                    await asyncio.sleep(min(2 ** attempt, 4))
        raise SourceError(self.provider, last_error)


class SteamSource(HttpSource):
    provider = "steam"
    SEARCH_URL = "https://store.steampowered.com/api/storesearch/"
    DETAILS_URL = "https://store.steampowered.com/api/appdetails"

    async def search(self, query: str) -> list[SourceRecord]:
        search = await self.get_json(
            self.SEARCH_URL,
            params={"term": query, "l": "schinese", "cc": "CN"},
        )
        items = search.get("items") or []
        records: list[SourceRecord] = []
        for item in items[: settings.crawl_max_results]:
            app_id = str(item.get("id", ""))
            if not app_id:
                continue
            try:
                details_cn = await self.get_json(
                    self.DETAILS_URL,
                    params={"appids": app_id, "l": "schinese", "cc": "CN"},
                )
            except SourceError as exc:
                self.warnings.append(f"Steam app {app_id}: {exc}")
                continue

            wrapper_cn = details_cn.get(app_id) or {}
            if not wrapper_cn.get("success") or not isinstance(wrapper_cn.get("data"), dict):
                continue
            if wrapper_cn["data"].get("type") not in (None, "game"):
                continue

            en_name = None
            try:
                details_en = await self.get_json(
                    self.DETAILS_URL,
                    params={"appids": app_id, "l": "english", "cc": "US"},
                )
                wrapper_en = details_en.get(app_id) or {}
                if wrapper_en.get("success") and isinstance(wrapper_en.get("data"), dict):
                    en_name = str(wrapper_en["data"].get("name") or "").strip()
            except SourceError:
                # English metadata is only an alias enhancement. Preserve the
                # complete Chinese record when this optional request fails.
                pass

            records.append(self.parse(app_id, wrapper_cn["data"], en_name))
        return records

    @staticmethod
    def parse(app_id: str, data: dict[str, Any], en_name: str | None = None) -> SourceRecord:
        release = None
        raw_date = (data.get("release_date") or {}).get("date")
        if raw_date:
            for fmt in ("%Y 年 %m 月 %d 日", "%d %b, %Y", "%b %d, %Y", "%Y-%m-%d"):
                try:
                    release = datetime.strptime(raw_date, fmt).date()
                    break
                except ValueError:
                    continue
        platforms = [key.title() for key, enabled in (data.get("platforms") or {}).items() if enabled]
        recommendations = (data.get("recommendations") or {}).get("total")
        ratings = [{"source": "Steam recommendations", "count": recommendations}] if recommendations else []
        media = [{"type": "screenshot", "url": shot.get("path_full")} for shot in (data.get("screenshots") or []) if shot.get("path_full")]

        # Build aliases list with English name if different from primary name
        cn_name = str(data.get("name") or "").strip()
        aliases = []
        if en_name and en_name != cn_name:
            aliases.append(en_name)

        return SourceRecord(
            provider="steam", external_id=app_id, url=f"https://store.steampowered.com/app/{app_id}",
            raw=data, name=cn_name, aliases=aliases,
            genres=[str(item.get("description")) for item in data.get("genres") or [] if item.get("description")],
            developers=list(data.get("developers") or []), publishers=list(data.get("publishers") or []),
            release_date=release, platforms=platforms, summary=data.get("short_description"),
            cover_url=data.get("header_image"), ratings=ratings, media=media,
        )


class SteamBrowserSource:
    provider = "steam-browser"

    @staticmethod
    def needs_fallback(record: SourceRecord) -> bool:
        return not record.summary or not record.cover_url or not record.genres or not record.media

    async def search(self, query: str) -> list[SourceRecord]:
        from playwright.async_api import async_playwright

        timeout_ms = settings.browser_crawl_timeout * 1000
        async with _browser_semaphore, async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            context = await browser.new_context(user_agent=settings.crawler_user_agent, locale="zh-CN")
            page = await context.new_page()
            try:
                await page.goto(f"https://store.steampowered.com/search/?term={quote(query)}", wait_until="domcontentloaded", timeout=timeout_ms)
                links = page.locator("a.search_result_row")
                records = []
                for index in range(min(await links.count(), settings.crawl_max_results)):
                    link = links.nth(index)
                    url = (await link.get_attribute("href") or "").split("?")[0]
                    app_id = url.rstrip("/").split("/")[-1]
                    name = (await link.locator(".title").text_content() or query).strip()
                    image = await link.locator("img").get_attribute("src")
                    if app_id.isdigit():
                        records.append(SourceRecord(provider="steam", external_id=app_id, url=url, raw={"browser_search": True}, name=name, cover_url=image))
                return records
            finally:
                await context.close()
                await browser.close()

    async def enrich(self, record: SourceRecord) -> SourceRecord:
        from playwright.async_api import async_playwright

        timeout_ms = settings.browser_crawl_timeout * 1000
        proxy = {"server": settings.proxy_pool[0]} if settings.proxy_pool else None
        last_error: Exception | None = None
        for attempt in range(settings.crawl_max_retries):
            try:
                async with _browser_semaphore, async_playwright() as playwright:
                    browser = await playwright.chromium.launch(headless=True, proxy=proxy)
                    context = await browser.new_context(user_agent=settings.crawler_user_agent, locale="zh-CN", extra_http_headers={"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7"})
                    await context.add_cookies([{"name": "birthtime", "value": "568022401", "domain": "store.steampowered.com", "path": "/"}, {"name": "mature_content", "value": "1", "domain": "store.steampowered.com", "path": "/"}])
                    page = await context.new_page()
                    try:
                        await page.goto(record.url, wait_until="domcontentloaded", timeout=timeout_ms)
                        await page.wait_for_timeout(500)
                        summary = await page.locator(".game_description_snippet").first.text_content() if await page.locator(".game_description_snippet").count() else None
                        cover = await page.locator(".game_header_image_full").first.get_attribute("src") if await page.locator(".game_header_image_full").count() else None
                        genres = [value.strip() for value in await page.locator("#genresAndManufacturer a").all_text_contents() if value.strip()]
                        screenshots = await page.locator("a.highlight_screenshot_link").evaluate_all("els => els.map(e => e.href)")
                        record.summary = record.summary or (summary.strip() if summary else None)
                        record.cover_url = record.cover_url or cover
                        record.genres = record.genres or genres
                        if not record.media: record.media = [{"type": "screenshot", "url": url} for url in screenshots[:12]]
                        record.raw = {**record.raw, "browser_fallback": {"summary": summary, "cover_url": cover, "genres": genres, "media": record.media}}
                        return record
                    finally:
                        await context.close(); await browser.close()
            except Exception as exc:
                last_error = exc
                if attempt + 1 < settings.crawl_max_retries: await asyncio.sleep(min(2 ** attempt, 4))
        raise SourceError(self.provider, str(last_error or "browser fallback failed"))

class WikipediaSource(HttpSource):
    provider = "wikipedia"
    API_URL = "https://zh.wikipedia.org/w/api.php"
    SUMMARY_URL = "https://zh.wikipedia.org/api/rest_v1/page/summary/{title}"

    async def search(self, query: str) -> list[SourceRecord]:
        search_payload = await self.get_json(self.API_URL, params={
            "action": "query", "list": "search", "srsearch": f"{query} 游戏",
            "srlimit": settings.crawl_max_results, "format": "json", "utf8": 1,
            "formatversion": 2,
        })
        matches = (search_payload.get("query") or {}).get("search") or []
        records: list[SourceRecord] = []
        for match in matches:
            title = str(match.get("title") or "").strip()
            if not title:
                continue
            try:
                summary = await self.get_json(
                    self.SUMMARY_URL.format(title=quote(title.replace(" ", "_"), safe="")),
                    headers={"Accept": "application/json", "Accept-Language": "zh-CN,zh;q=0.9"},
                )
                records.append(self.parse_summary(summary, match))
            except SourceError as exc:
                self.warnings.append(f"Wikipedia REST {title}: {exc}")

        if records:
            return records

        # REST may be blocked independently from the Action API. Keep the source
        # useful by falling back to one structured Action API request.
        fallback = await self.get_json(self.API_URL, params={
            "action": "query", "generator": "search", "gsrsearch": f"{query} 游戏",
            "gsrlimit": settings.crawl_max_results, "prop": "extracts|info|pageimages",
            "exintro": 1, "explaintext": 1, "inprop": "url", "piprop": "original",
            "format": "json", "utf8": 1, "formatversion": 2,
        })
        pages = (fallback.get("query") or {}).get("pages") or []
        return [self.parse(page) for page in pages if page.get("title")]

    @staticmethod
    def parse_summary(summary: dict[str, Any], match: dict[str, Any] | None = None) -> SourceRecord:
        title = str(summary.get("title") or (match or {}).get("title") or "").strip()
        content_urls = summary.get("content_urls") or {}
        desktop_url = (content_urls.get("desktop") or {}).get("page")
        page_id = str(summary.get("pageid") or summary.get("wikibase_item") or title)
        thumbnail = summary.get("originalimage") or summary.get("thumbnail") or {}
        return SourceRecord(
            provider="wikipedia", external_id=page_id,
            url=desktop_url or f"https://zh.wikipedia.org/wiki/{quote(title.replace(' ', '_'))}",
            raw={"summary": summary, "search": match or {}}, name=title,
            summary=summary.get("extract"), cover_url=thumbnail.get("source"),
        )

    @staticmethod
    def parse(page: dict[str, Any]) -> SourceRecord:
        page_id = str(page.get("pageid", page.get("title")))
        title = str(page.get("title") or "").strip()
        return SourceRecord(
            provider="wikipedia",
            external_id=page_id,
            url=page.get("fullurl") or f"https://zh.wikipedia.org/wiki/{quote(title.replace(' ', '_'))}",
            raw=page,
            name=title,
            summary=page.get("extract"),
            cover_url=(page.get("original") or {}).get("source"),
        )
