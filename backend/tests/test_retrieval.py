from app.engine.retrieval import _escape_like, _snippet


def test_snippet_starts_near_the_first_match():
    content = '{"canonicalurl": "https://example.test", "extract": "' + "x" * 300 + '艾尔登法环 的战斗系统设计很出色' + "y" * 300 + '"}'
    snippet = _snippet(content, ["艾尔", "战斗"])
    assert "艾尔登法环" in snippet
    assert snippet.index("艾尔") < 200


def test_snippet_falls_back_to_the_head():
    assert _snippet("short content", ["missing"]) == "short content"
    assert _snippet("", ["anything"]) == ""


def test_escape_like_escapes_wildcards():
    assert _escape_like("100%_a\\b") == "100\\%\\_a\\\\b"
