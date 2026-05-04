"""Search API endpoints: hybrid search + autocomplete suggestions."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from ..services.search import SearchResult, get_search_engine

router = APIRouter(prefix="/api/search", tags=["search"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class SearchRequest(BaseModel):
    query: str
    top_k: int = 10
    folder: Optional[str] = None


class SuggestionRequest(BaseModel):
    prefix: str
    limit: int = 5


class SearchResultResponse(BaseModel):
    doc_id: str
    title: str
    folder: str
    snippet: str
    score: float
    highlights: list[str] = []


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/")
async def search(body: SearchRequest) -> list[SearchResultResponse]:
    """Hybrid BM25 + vector search with optional reranking.

    Returns a ranked list of matching documents with snippet highlights.
    """
    engine = get_search_engine()
    results: list[SearchResult] = engine.search(
        query=body.query,
        top_k=body.top_k,
        folder=body.folder,
    )
    return [
        SearchResultResponse(
            doc_id=r.doc_id,
            title=r.title,
            folder=r.folder,
            snippet=r.snippet,
            score=r.score,
            highlights=r.highlights,
        )
        for r in results
    ]


@router.post("/suggestions")
async def suggestions(body: SuggestionRequest) -> list[str]:
    """Return autocomplete title suggestions matching *prefix*.

    Uses SQLite FTS5 prefix search for fast results.
    """
    from ..core.database import get_db

    prefix = body.prefix.strip()
    if not prefix:
        return []

    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT DISTINCT d.title
            FROM documents_fts
            JOIN documents d ON d.rowid = documents_fts.rowid
            WHERE documents_fts MATCH ?
            LIMIT ?
            """,
            (prefix + "*", body.limit),
        ).fetchall()

    return [r[0] for r in rows if r[0]]
