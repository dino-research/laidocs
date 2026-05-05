# tests/test_converter_fallback.py
"""Explicit fallback tests for DoclingConverter._refine().

These verify graceful degradation when:
  1. LLM is not configured at all (no base_url / model)
  2. LLM is configured but the API call raises an exception
"""

from unittest.mock import patch
from backend.services.converter import DoclingConverter


def _make_settings(base_url="", model="", api_key=""):
    return type("S", (), {
        "llm": type("L", (), {
            "base_url": base_url,
            "model": model,
            "api_key": api_key,
        })()
    })()


def test_refine_returns_raw_when_llm_not_configured():
    """No LLM base_url → returns raw markdown unchanged, makes no network call."""
    conv = DoclingConverter.__new__(DoclingConverter)
    conv._settings = _make_settings(base_url="", model="")
    raw = "# Raw Markdown\n\nGarbage: @@@@"
    result = conv._refine(raw)
    assert result == raw


def test_refine_returns_raw_when_model_missing():
    """base_url present but model empty → treated as not configured."""
    conv = DoclingConverter.__new__(DoclingConverter)
    conv._settings = _make_settings(base_url="http://localhost:11434/v1", model="")
    raw = "# Text"
    assert conv._refine(raw) == raw


def test_refine_returns_raw_on_exception():
    """LLM configured but call raises → falls back to raw, does not re-raise."""
    conv = DoclingConverter.__new__(DoclingConverter)
    conv._settings = _make_settings(
        base_url="http://fake-host/v1",
        model="gpt-4o",
        api_key="secret",
    )
    with patch("backend.services.converter.OpenAI") as mock_openai:
        mock_openai.return_value.chat.completions.create.side_effect = Exception("connection refused")
        result = conv._refine("# Raw")
    assert result == "# Raw"


def test_refine_preserves_image_tags_on_success():
    """Even when LLM succeeds, image markdown tags in the response are preserved."""
    conv = DoclingConverter.__new__(DoclingConverter)
    conv._settings = _make_settings(
        base_url="http://localhost:11434/v1",
        model="llama3",
        api_key="none",
    )
    cleaned = "# Doc\n\n![Image 1](/assets/abc_0.png)\n\n> **Description:** A chart.\n\nSome text."
    with patch("backend.services.converter.OpenAI") as mock_openai:
        mock_openai.return_value.chat.completions.create.return_value \
            .choices[0].message.content = cleaned
        result = conv._refine("# Doc\n\n![Image 1](/assets/abc_0.png)\n\nGarbage @@")
    assert "![Image 1](/assets/abc_0.png)" in result
    assert "> **Description:** A chart." in result
