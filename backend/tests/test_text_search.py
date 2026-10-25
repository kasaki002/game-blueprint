from app.engine.text_search import (
    document_tokens,
    iter_tokens,
    query_tokens,
    search_text,
    tsquery_text,
)


def test_cjk_text_becomes_overlapping_bigrams():
    assert document_tokens("艾尔登法环") == ["艾尔", "尔登", "登法", "法环"]


def test_single_cjk_character_is_kept():
    assert document_tokens("神") == ["神"]


def test_mixed_text_keeps_order_and_lowercases_ascii():
    assert document_tokens("ELDEN Ring 1245620") == ["elden", "ring", "1245620"]


def test_punctuation_and_full_width_are_normalized():
    assert document_tokens("《黑神话：悟空》 v1.0") == [
        "黑神", "神话", "悟空", "v1", "0",
    ]


def test_query_drops_question_words():
    tokens = query_tokens("艾尔登法环的战斗设计怎么样")
    assert "怎么" not in tokens
    assert "么样" not in tokens
    assert {"艾尔", "尔登", "登法", "法环", "战斗", "设计"} <= set(tokens)


def test_query_is_deduped_and_capped():
    assert query_tokens("boss boss BOSS") == ["boss"]
    long_text = "".join(chr(0x4E00 + index) for index in range(200))
    assert len(query_tokens(long_text, limit=10)) == 10


def test_empty_input_produces_no_tokens():
    assert document_tokens("") == []
    assert document_tokens("。。。！？") == []
    assert search_text("") == ""
    assert tsquery_text([]) == ""


def test_iter_tokens_is_not_deduped():
    # iter_tokens keeps repeated terms for callers that need raw order;
    # document_tokens is the deduped variant stored in tsvector.
    assert iter_tokens("原神 原神") == ["原神", "原神"]


def test_search_text_is_space_joined():
    assert search_text("艾尔登法环") == "艾尔 尔登 登法 法环"
    assert tsquery_text(["艾尔", "法环"]) == "艾尔 | 法环"
