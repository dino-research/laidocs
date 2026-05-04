"""Hybrid search engine: BM25 (SQLite FTS5) + dense vector (LanceDB) + RRF fusion.

Optional reranking via an OpenAI-compatible cross-encoder endpoint.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

from ..core.config import Settings, get_settings
from ..core.database import get_db, get_lance_table

# ---------------------------------------------------------------------------
# Result data class
# ---------------------------------------------------------------------------


@dataclass
class SearchResult:
    doc_id: str
    title: str
    folder: str
    snippet: str
    score: float
    highlights: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# RRF helper
# ---------------------------------------------------------------------------

_RRF_K = 60  # standard RRF constant


def _rrf_score(rank: int) -> float:
    return 1.0 / (_RRF_K + rank)


def _rrf_fuse(
    ranked_lists: list[list[str]],
) -> dict[str, float]:
    """Merge multiple ranked doc-id lists using Reciprocal Rank Fusion."""
    scores: dict[str, float] = {}
    for ranked in ranked_lists:
        for rank, doc_id in enumerate(ranked, start=1):
            scores[doc_id] = scores.get(doc_id, 0.0) + _rrf_score(rank)
    return scores


# ---------------------------------------------------------------------------
# BM25 via SQLite FTS5
# ---------------------------------------------------------------------------


def _bm25_search(
    query: str,
    top_k: int,
    folder: Optional[str] = None,
) -> list[tuple[str, str, str, str]]:
    """Run full-text search via SQLite FTS5.

    Returns list of (doc_id, title, folder, snippet).
    """
    with get_db() as conn:
        if folder:
            rows = conn.execute(
                """
                SELECT d.id, d.title, d.folder,
                       snippet(documents_fts, 1, '<b>', '</b>', '...', 20) AS snip
                FROM documents_fts
                JOIN documents d ON d.rowid = documents_fts.rowid
                WHERE documents_fts MATCH ?
                  AND d.folder = ?
                ORDER BY rank
                LIMIT ?
                """,
                (query, folder, top_k),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT d.id, d.title, d.folder,
                       snippet(documents_fts, 1, '<b>', '</b>', '...', 20) AS snip
                FROM documents_fts
                JOIN documents d ON d.rowid = documents_fts.rowid
                WHERE documents_fts MATCH ?
                ORDER BY rank
                LIMIT ?
                """,
                (query, top_k),
            ).fetchall()
    return [(r["id"], r["title"] or "", r["folder"] or "", r["snip"] or "") for r in rows]


# ---------------------------------------------------------------------------
# Vector search via LanceDB
# ---------------------------------------------------------------------------


def _vector_search(
    query_vector: list[float],
    top_k: int,
    folder: Optional[str] = None,
) -> list[tuple[str, float]]:
    """Return (doc_id, score) pairs ranked by cosine similarity.

    Multiple chunks from the same document are merged: only the best
    chunk score per document is kept.
    """
    table = get_lance_table()
    # LanceDB returns a pandas DataFrame
    results = (
        table.search(query_vector)
        .metric("cosine")
        .limit(top_k * 5)  # over-fetch to handle per-doc dedup
        .to_pandas()
    )

    best_per_doc: dict[str, float] = {}
    for _, row in results.iterrows():
        doc_id = row["doc_id"]
        score = float(row.get("_distance", 1.0))
        # Lower distance = more similar; invert to similarity score
        sim = max(0.0, 1.0 - score)
        if doc_id not in best_per_doc or sim > best_per_doc[doc_id]:
            best_per_doc[doc_id] = sim

    # Optionally filter by folder
    if folder:
        with get_db() as conn:
            folder_docs = {
                r[0]
                for r in conn.execute(
                    "SELECT id FROM documents WHERE folder=?", (folder,)
                ).fetchall()
            }
        best_per_doc = {k: v for k, v in best_per_doc.items() if k in folder_docs}

    ranked = sorted(best_per_doc.items(), key=lambda x: x[1], reverse=True)
    return ranked[:top_k]


# ---------------------------------------------------------------------------
# Metadata helpers
# ---------------------------------------------------------------------------


def _fetch_doc_meta(doc_ids: list[str]) -> dict[str, dict]:
    """Return title/folder/snippet keyed by doc_id."""
    if not doc_ids:
        return {}
    placeholders = ",".join("?" * len(doc_ids))
    with get_db() as conn:
        rows = conn.execute(
            f"SELECT id, title, folder, SUBSTR(content, 1, 300) AS snip FROM documents WHERE id IN ({placeholders})",
            doc_ids,
        ).fetchall()
    return {r["id"]: {"title": r["title"] or "", "folder": r["folder"] or "", "snip": r["snip"] or ""} for r in rows}


# ---------------------------------------------------------------------------
# Reranker (optional)
# ---------------------------------------------------------------------------


def _rerank(
    query: str,
    candidates: list[SearchResult],
    settings: Settings,
    top_k: int,
) -> list[SearchResult]:
    """Call a cross-encoder reranker via OpenAI-compatible API if configured."""
    cfg = settings.reranker
    if not cfg.enabled or not cfg.model or not cfg.base_url:
        return candidates[:top_k]

    try:
        from openai import OpenAI

        client = OpenAI(base_url=cfg.base_url, api_key=cfg.api_key or "sk-placeholder")
        texts = [r.snippet for r in candidates]
        resp = client.embeddings.create(
            model=cfg.model,
            input=[[query, t] for t in texts],
        )
        scores = sorted(resp.data, key=lambda x: x.index)
        for i, item in enumerate(scores):
            candidates[i].score = float(item.embedding[0])
        candidates.sort(key=lambda r: r.score, reverse=True)
    except Exception:
        pass  # reranker optional; fall through

    return candidates[:top_k]


# ---------------------------------------------------------------------------
# Public SearchEngine
# ---------------------------------------------------------------------------


class SearchEngine:
    """Hybrid BM25 + vector search with optional reranking."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    def _embedding_enabled(self) -> bool:
        cfg = self._settings.embedding
        return bool(cfg.model and cfg.base_url)

    def _embed_query(self, query: str) -> list[float] | None:
        if not self._embedding_enabled():
            return None
        from openai import OpenAI

        cfg = self._settings.embedding
        client = OpenAI(base_url=cfg.base_url, api_key=cfg.api_key or "sk-placeholder")
        resp = client.embeddings.create(model=cfg.model, input=[query])
        return resp.data[0].embedding

    def search(
        self,
        query: str,
        top_k: int = 10,
        folder: Optional[str] = None,
    ) -> list[SearchResult]:
        """Run hybrid search and return ranked SearchResult list."""

        # ── 1. BM25 search ──────────────────────────────────────────
        bm25_hits = _bm25_search(query, top_k * 2, folder)
        bm25_ids = [h[0] for h in bm25_hits]
        bm25_snippets = {h[0]: (h[1], h[2], h[3]) for h in bm25_hits}

        # ── 2. Vector search (optional) ──────────────────────────────
        vec_ids: list[str] = []
        vec_scores: dict[str, float] = {}
        query_vec = self._embed_query(query)
        if query_vec is not None:
            try:
                vec_hits = _vector_search(query_vec, top_k * 2, folder)
                vec_ids = [h[0] for h in vec_hits]
                vec_scores = {h[0]: h[1] for h in vec_hits}
            except Exception:
                pass  # empty table, etc.

        # ── 3. RRF fusion ────────────────────────────────────────────
        ranked_lists = [bm25_ids]
        if vec_ids:
            ranked_lists.append(vec_ids)

        fused = _rrf_fuse(ranked_lists)

        if not fused:
            return []

        # ── 4. Fetch metadata for fused doc ids ──────────────────────
        all_ids = list(fused.keys())
        meta = _fetch_doc_meta(all_ids)

        # Merge BM25 snippets (they include highlights) into meta
        for doc_id, (title, fold, snip) in bm25_snippets.items():
            if doc_id in meta:
                meta[doc_id]["snip"] = snip  # prefer highlighted snippet

        # ── 5. Build result objects ───────────────────────────────────
        results: list[SearchResult] = []
        for doc_id, score in sorted(fused.items(), key=lambda x: x[1], reverse=True):
            m = meta.get(doc_id)
            if not m:
                continue
            results.append(
                SearchResult(
                    doc_id=doc_id,
                    title=m["title"],
                    folder=m["folder"],
                    snippet=m["snip"],
                    score=score,
                    highlights=[],
                )
            )

        # ── 6. Optional reranking ─────────────────────────────────────
        results = _rerank(query, results, self._settings, top_k)

        return results[:top_k]


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_engine: SearchEngine | None = None


def get_search_engine() -> SearchEngine:
    """Return the application-wide SearchEngine singleton."""
    global _engine
    if _engine is None:
        _engine = SearchEngine()
    return _engine
