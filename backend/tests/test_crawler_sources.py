import json
from pathlib import Path

from app.workers.normalize import merge_records, normalize_query
from app.workers.sources import SteamSource, WikipediaSource

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_parse_steam_details():
    record = SteamSource.parse("1245620", load("steam_details.json"))
    assert record.name == "Elden Ring"
    assert record.release_date.isoformat() == "2022-02-25"
    assert record.platforms == ["Windows"]
    assert record.genres == ["RPG", "Action"]
    assert record.ratings[0]["count"] == 700000


def test_parse_wikipedia_page():
    record = WikipediaSource.parse(load("wikipedia_page.json"))
    assert record.external_id == "12345"
    assert record.name == "艾尔登法环"
    assert "动作角色扮演" in record.summary


def test_parse_wikipedia_rest_summary():
    record = WikipediaSource.parse_summary({
        "title": "艾尔登法环",
        "pageid": 12345,
        "extract": "开放世界动作角色扮演游戏。",
        "content_urls": {"desktop": {"page": "https://zh.wikipedia.org/wiki/艾尔登法环"}},
        "thumbnail": {"source": "https://upload.wikimedia.org/cover.jpg"},
    })
    assert record.external_id == "12345"
    assert record.name == "艾尔登法环"
    assert record.summary.startswith("开放世界")
    assert record.cover_url.endswith("cover.jpg")


def test_merge_prefers_steam_structure_and_wikipedia_summary():
    steam = SteamSource.parse("1245620", load("steam_details.json"))
    wiki = WikipediaSource.parse(load("wikipedia_page.json"))
    steam.aliases.append("艾尔登法环")
    wiki.aliases.append("Elden Ring")
    merged = merge_records([steam, wiki], "Elden Ring")
    assert len(merged) == 1
    assert merged[0]["name"] == "Elden Ring"
    assert merged[0]["summary"].startswith("《艾尔登法环》")
    assert {item["provider"] for item in merged[0]["sources"]} == {"steam", "wikipedia"}


def test_merge_keeps_original_search_term_as_alias():
    steam = SteamSource.parse("1245620", load("steam_details.json"))
    merged = merge_records([steam], "艾尔登法环")
    assert "艾尔登法环" in merged[0]["aliases"]


def test_merge_does_not_attach_unrelated_first_wikipedia_result():
    steam = SteamSource.parse("1245620", load("steam_details.json"))
    wiki = WikipediaSource.parse(load("wikipedia_page.json"))
    wiki.name = "黑暗之魂"
    wiki.aliases = []
    merged = merge_records([steam, wiki], "Elden Ring")
    assert len(merged) == 2
    steam_game = next(item for item in merged if item["name"] == "Elden Ring")
    assert {item["provider"] for item in steam_game["sources"]} == {"steam"}


def test_normalize_query_collapses_spacing_and_case():
    assert normalize_query("  ELDEN   Ring ") == "elden ring"
