"""Custom exception hierarchy for LAIDocs backend.

All exceptions map cleanly to HTTP status codes via the global handler
registered in main.py.
"""

from __future__ import annotations

from fastapi import HTTPException


class LAIDocsError(Exception):
    """Base class for all LAIDocs domain errors."""

    http_status: int = 500
    default_message: str = "An unexpected error occurred"

    def __init__(self, message: str | None = None) -> None:
        self.message = message or self.default_message
        super().__init__(self.message)

    def to_http_exception(self) -> HTTPException:
        return HTTPException(status_code=self.http_status, detail=self.message)


# ---------------------------------------------------------------------------
# Conversion errors
# ---------------------------------------------------------------------------


class ConversionError(LAIDocsError):
    """Raised when MarkItDown or a file converter fails."""

    http_status = 422
    default_message = "Failed to convert document"


# ---------------------------------------------------------------------------
# Crawl errors
# ---------------------------------------------------------------------------


class CrawlError(LAIDocsError):
    """Raised when a URL crawl fails or returns no content."""

    http_status = 502
    default_message = "Failed to crawl the requested URL"


# ---------------------------------------------------------------------------
# Indexing errors
# ---------------------------------------------------------------------------


class IndexingError(LAIDocsError):
    """Raised when embedding or vector-store write fails."""

    http_status = 500
    default_message = "Failed to index document"


# ---------------------------------------------------------------------------
# LLM / RAG errors
# ---------------------------------------------------------------------------


class LLMError(LAIDocsError):
    """Raised when an LLM API call fails."""

    http_status = 502
    default_message = "LLM API call failed"


class LLMNotConfiguredError(LAIDocsError):
    """Raised when an LLM operation is requested without configuration."""

    http_status = 503
    default_message = "LLM is not configured. Please set the LLM endpoint in Settings."


# ---------------------------------------------------------------------------
# Vault / storage errors
# ---------------------------------------------------------------------------


class DocumentNotFoundError(LAIDocsError):
    """Raised when a requested document does not exist."""

    http_status = 404
    default_message = "Document not found"


class FolderNotFoundError(LAIDocsError):
    """Raised when a requested folder does not exist."""

    http_status = 404
    default_message = "Folder not found"
