# tests/test_docling_converter.py
"""Tests for the DoclingConverter service."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


def _make_converter_no_settings():
    """Create a DoclingConverter bypassing __init__ (no real settings needed)."""
    from backend.services.converter import DoclingConverter
    obj = DoclingConverter.__new__(DoclingConverter)
    return obj


# ── _extract_title ─────────────────────────────────────────────────────────────

def test_extract_title_from_h1():
    """Extracts the first H1 heading as title."""
    from backend.services.converter import _extract_title
    md = "# My Great Document\n\nSome content."
    assert _extract_title(md, "/path/to/file.pdf") == "My Great Document"


def test_extract_title_falls_back_to_filename():
    """When no H1 heading, uses the filename stem."""
    from backend.services.converter import _extract_title
    title = _extract_title("Some plain text without headings.", "/path/to/my_file.pdf")
    assert title == "my_file"


def test_extract_title_strips_whitespace():
    """Strips surrounding whitespace from H1."""
    from backend.services.converter import _extract_title
    assert _extract_title("#   Padded Title  \n\ntext", "f.pdf") == "Padded Title"


# ── DoclingConverter._refine ───────────────────────────────────────────────────

def test_refine_returns_raw_when_no_base_url():
    """Returns raw markdown when LLM base_url is empty — no LLM call made."""
    conv = _make_converter_no_settings()
    conv._settings = type("S", (), {
        "llm": type("L", (), {"base_url": "", "model": "", "api_key": ""})()
    })()
    raw = "# Title\n\nGarbage: @@@"
    assert conv._refine(raw) == raw


def test_refine_returns_raw_on_llm_exception():
    """Falls back to raw markdown when the LLM call raises."""
    conv = _make_converter_no_settings()
    conv._settings = type("S", (), {
        "llm": type("L", (), {
            "base_url": "http://fake",
            "model": "gpt-4o",
            "api_key": "k",
        })()
    })()
    with patch("backend.services.converter.OpenAI") as mock_openai:
        mock_openai.return_value.chat.completions.create.side_effect = Exception("timeout")
        result = conv._refine("# Raw")
    assert result == "# Raw"


def test_refine_calls_llm_and_returns_cleaned():
    """When LLM succeeds, returns the cleaned content."""
    conv = _make_converter_no_settings()
    conv._settings = type("S", (), {
        "llm": type("L", (), {
            "base_url": "http://localhost:11434/v1",
            "model": "llama3",
            "api_key": "none",
        })()
    })()
    with patch("backend.services.converter.OpenAI") as mock_openai:
        mock_resp = MagicMock()
        mock_resp.choices[0].message.content = "# Cleaned\n\nContent."
        mock_openai.return_value.chat.completions.create.return_value = mock_resp
        result = conv._refine("# Raw\n\nGarbage @@")
    assert result == "# Cleaned\n\nContent."


# ── DoclingConverter.convert_file (integration-style with mocks) ───────────────

def test_convert_file_returns_markdown_and_title(tmp_path):
    """convert_file returns (markdown, title) for a valid document."""
    from backend.services.converter import DoclingConverter

    conv = DoclingConverter.__new__(DoclingConverter)
    conv._settings = type("S", (), {
        "llm": type("L", (), {"base_url": "", "model": "", "api_key": ""})()
    })()

    mock_docling = MagicMock()
    mock_result = MagicMock()
    mock_doc = MagicMock()
    mock_result.document = mock_doc
    mock_docling.convert.return_value = mock_result
    conv._converter = mock_docling

    with patch("backend.services.converter.MarkdownDocSerializer") as MockSer:
        MockSer.return_value.serialize.return_value.text = "# My Doc\n\nHello world."
        md, title = conv.convert_file(
            str(tmp_path / "test.pdf"),
            doc_id="abc123",
            assets_dir=tmp_path / "assets",
        )

    assert "# My Doc" in md
    assert title == "My Doc"
