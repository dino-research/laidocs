"""Web crawling service — Crawl4AI with httpx + html2text fallback."""

from __future__ import annotations

import logging
import re
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


class WebCrawler:
    """Crawl a URL and return (markdown_content, title).

    Tries Crawl4AI (headless browser) first. Falls back to a simple
    httpx + html2text fetch if Crawl4AI is unavailable or fails.
    """

    def __init__(self) -> None:
        from ..core.config import get_settings

        self.settings = get_settings()
        self._crawl4ai_available: bool | None = None  # lazy-checked

    # ── public interface ─────────────────────────────────────────────

    async def crawl(self, url: str) -> tuple[str, str]:
        """Crawl *url* and return ``(markdown, title)``."""
        if self._crawl4ai_available is None:
            self._crawl4ai_available = self._check_crawl4ai()

        if self._crawl4ai_available:
            try:
                return await self._crawl_with_crawl4ai(url)
            except Exception as exc:
                logger.warning("Crawl4AI failed for %s: %s — falling back", url, exc)

        return await self._crawl_simple(url)

    # ── Crawl4AI path ───────────────────────────────────────────────

    @staticmethod
    def _check_crawl4ai() -> bool:
        try:
            from crawl4ai import AsyncWebCrawler  # noqa: F401
            return True
        except ImportError:
            return False

    async def _crawl_with_crawl4ai(self, url: str) -> tuple[str, str]:
        from crawl4ai import AsyncWebCrawler, CrawlerRunConfig

        config = CrawlerRunConfig(
            word_count_threshold=10,
            remove_forms=True,
            only_text=False,
        )

        async with AsyncWebCrawler() as crawler:
            result = await crawler.arun(url)

        if not result.success:
            raise RuntimeError(f"Crawl failed: {result.error_message}")

        markdown: str = result.markdown_v2.raw_markdown if result.markdown_v2 else (result.markdown or "")
        title = self._extract_title(markdown, url)
        return markdown, title

    # ── simple fallback ─────────────────────────────────────────────

    async def _crawl_simple(self, url: str) -> tuple[str, str]:
        """Fallback: plain HTTP GET → html2text."""
        import httpx
        from html2text import html2text

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "LAIDocs/1.0"})
            resp.raise_for_status()

        html = resp.text
        markdown = html2text(html)
        title = self._extract_title(markdown, url)
        return markdown, title

    # ── helpers ─────────────────────────────────────────────────────

    @staticmethod
    def _extract_title(markdown: str, url: str) -> str:
        """Return the first H1 line or derive a title from the URL."""
        match = re.search(r"^#\s+(.+)$", markdown, re.MULTILINE)
        if match:
            return match.group(1).strip()

        path = urlparse(url).path.strip("/")
        return path.split("/")[-1] if path else "Untitled"
