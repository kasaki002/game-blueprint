"""Pure normalization helpers shared by crawler adapters and persistence."""
from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Any

from app.workers.sources import SourceRecord


def normalize_query(value: str) -> str:
    value = re.sub(r"[^\w\s]", " ", value.casefold(), flags=re.UNICODE)
    return re.sub(r"\s+", " ", value).strip()


def record_names(record: SourceRecord) -> set[str]:
    return {name for name in (normalize_query(record.name), *(normalize_query(item) for item in record.aliases)) if name}


def records_match(left: SourceRecord, right: SourceRecord, query: str) -> bool:
    """Conservatively decide whether two source records describe the same game."""
    left_names = record_names(left)
    right_names = record_names(right)
    if left_names & right_names:
        return True

    normalized_query = normalize_query(query)
    if normalized_query and normalized_query in left_names and normalized_query in right_names:
        return True

    # Check if both records share the same external_id from Steam
    if (left.provider == "steam" and right.provider == "steam" and
        left.external_id == right.external_id):
        return True

    # More lenient matching for cross-language pairs (e.g., Steam + Wikipedia)
    # If one is from Steam and the other from Wikipedia, lower the threshold
    is_cross_language = (
        (left.provider == "steam" and right.provider == "wikipedia") or
        (left.provider == "wikipedia" and right.provider == "steam")
    )

    threshold = 0.85 if is_cross_language else 0.92

    return any(
        min(len(left_name), len(right_name)) >= 6
        and SequenceMatcher(None, left_name, right_name).ratio() >= threshold
        for left_name in left_names
        for right_name in right_names
    )


def merge_records(records: list[SourceRecord], query: str) -> list[dict[str, Any]]:
    """Merge records that describe the same title while keeping source attribution."""
    groups: list[list[SourceRecord]] = []
    for record in records:
        matched_group = next(
            (group for group in groups if any(records_match(record, existing, query) for existing in group)),
            None,
        )
        if matched_group is None:
            groups.append([record])
        else:
            matched_group.append(record)

    merged = []
    for group in groups:
        primary = next((item for item in group if item.provider == "steam"), group[0])
        aliases = {item.name for item in group if item.name != primary.name}
        for item in group:
            aliases.update(item.aliases)
        if query.strip() and normalize_query(query) != normalize_query(primary.name):
            aliases.add(query.strip())
        aliases.discard(primary.name)
        merged.append({
            "name": primary.name or query,
            "aliases": sorted(aliases),
            "genres": sorted({value for item in group for value in item.genres}),
            "developers": sorted({value for item in group for value in item.developers}),
            "publishers": sorted({value for item in group for value in item.publishers}),
            "release_date": next((item.release_date for item in group if item.release_date), None),
            "platforms": sorted({value for item in group for value in item.platforms}),
            "summary": next((item.summary for item in group if item.provider == "wikipedia" and item.summary), None)
                or next((item.summary for item in group if item.summary), None),
            "cover_url": next((item.cover_url for item in group if item.provider == "steam" and item.cover_url), None)
                or next((item.cover_url for item in group if item.cover_url), None),
            "ratings": [value for item in group for value in item.ratings],
            "media": [value for item in group for value in item.media],
            "sources": [
                {"provider": item.provider, "external_id": item.external_id, "url": item.url}
                for item in group
            ],
            "records": group,
        })
    return merged
