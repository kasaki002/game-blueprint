"""CJK-aware tokenization for PostgreSQL full-text search.

PostgreSQL's ``simple`` text-search configuration does not segment Chinese.
A whole Chinese sentence becomes a single lexeme, so a natural-language query
such as ``艾尔登法环战斗设计`` never matches a document that merely mentions
``艾尔登法环``.  Split CJK runs into overlapping bigrams (the same idea as the
``pg_bigm`` extension) and reuse the exact same tokenizer for documents and
queries.  ASCII words and numbers are kept as-is and lowercased by PostgreSQL.

The tokenizer is deterministic and dependency free, which keeps indexing and
querying in sync and makes it easy to unit test without a database.
"""
from __future__ import annotations

import re
import unicodedata

# CJK Unified Ideographs (plus Ext A and Compatibility Ideographs).
_CJK_RANGES = "\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff"
# Alternation keeps token order stable; group 1 = CJK run, group 2 = ASCII word.
_TOKEN_RUN = re.compile(f"([{_CJK_RANGES}]+)|([a-z0-9]+)")

# Only stripped from queries.  Documents keep every token so that adding a
# stopword later never requires re-indexing the corpus.
_QUERY_STOPWORDS = frozenset({
    # Chinese question words and particles (mostly bigrams, matching the
    # tokenizer output).
    "什么", "怎么", "怎样", "么样", "如何", "为何", "为什", "是否", "可以",
    "能否", "哪些", "哪个", "这个", "那个", "这些", "那些", "以及", "一个",
    "一些", "的话", "了吗", "呢", "吗", "吧", "啊", "呀", "的", "了",
    # English function words.  ``simple`` does not remove stopwords either,
    # but dropping them from queries reduces noise in OR-based matching.
    "a", "an", "the", "and", "or", "of", "to", "in", "on", "at", "for",
    "with", "is", "are", "was", "were", "be", "been", "do", "does", "did",
    "what", "how", "why", "which", "that", "this", "it", "its", "as", "by",
})

_MAX_QUERY_TOKENS = 48


def _cjk_tokens(run: str) -> list[str]:
    if len(run) == 1:
        return [run]
    return [run[index:index + 2] for index in range(len(run) - 1)]


def iter_tokens(text: str) -> list[str]:
    """Yield every search token in ``text``, preserving order."""
    normalized = unicodedata.normalize("NFKC", text or "").casefold()
    tokens: list[str] = []
    for match in _TOKEN_RUN.finditer(normalized):
        cjk_run, word = match.group(1), match.group(2)
        if cjk_run:
            tokens.extend(_cjk_tokens(cjk_run))
        elif word:
            tokens.append(word)
    return tokens


def dedupe(tokens: list[str]) -> list[str]:
    # dict preserves insertion order and is faster than a seen-set loop here.
    return list(dict.fromkeys(tokens))


def document_tokens(text: str) -> list[str]:
    """Tokens stored in ``document_chunks.search_vector``."""
    return dedupe(iter_tokens(text))


def query_tokens(text: str, limit: int = _MAX_QUERY_TOKENS) -> list[str]:
    """Tokens used to build the query tsquery.

    Stopwords are removed and the result is capped so a pasted paragraph does
    not create an enormous OR query.
    """
    return [
        token for token in document_tokens(text)
        if token not in _QUERY_STOPWORDS
    ][:limit]


def search_text(text: str) -> str:
    """Space-joined tokens ready for ``to_tsvector('simple', ...)``."""
    return " ".join(document_tokens(text))


def tsquery_text(tokens: list[str]) -> str:
    """Build an OR tsquery. Tokens come from our own regex, so they are safe."""
    return " | ".join(tokens)
