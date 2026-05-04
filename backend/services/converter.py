"""Document conversion service — MarkItDown wrapper with optional LLM enhancement."""

from __future__ import annotations

import re
from pathlib import Path


class DocumentConverter:
    """Convert uploaded files to Markdown using MarkItDown."""

    def __init__(self) -> None:
        """Initialize MarkItDown converter, optionally with LLM client."""
        from markitdown import MarkItDown

        from ..core.config import get_settings

        settings = get_settings()

        llm_client = None
        llm_model = None
        if settings.llm.base_url and settings.llm.api_key and settings.llm.model:
            from openai import OpenAI

            llm_client = OpenAI(
                base_url=settings.llm.base_url,
                api_key=settings.llm.api_key,
            )
            llm_model = settings.llm.model

        self.converter = MarkItDown(
            llm_client=llm_client,
            llm_model=llm_model,
            enable_plugins=True,
        )

    def convert_file(self, file_path: str) -> tuple[str, str]:
        """Convert a file to Markdown.

        Returns:
            (markdown_content, title)
        """
        result = self.converter.convert(file_path)
        markdown = result.text_content
        title = self._extract_title(markdown, file_path)
        return markdown, title

    # ── helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _extract_title(markdown: str, file_path: str) -> str:
        """Extract title from the first H1 heading, falling back to the filename stem."""
        match = re.search(r"^#\s+(.+)$", markdown, re.MULTILINE)
        if match:
            return match.group(1).strip()
        return Path(file_path).stem
