"""Document indexer: chunking, embedding, and dual-index storage.

Writes to:
  - LanceDB   -- dense vector embeddings per chunk
  - SQLite FTS5 -- BM25 full-text index (via documents table triggers)

The embedding client is OpenAI-SDK-compatible so any provider with an
OpenAI-compatible endpoint works (OpenAI, Ollama, LocalAI, vLLM, etc.).
"""

from __future__ import annotations

import re
from typing import Sequence

from ..core.config import EmbeddingConfig, Settings, get_settings
from ..core.database import get_db, get_lance_table

# ---------------------------------------------------------------------------
# Default chunking parameters
# ---------------------------------------------------------------------------

CHUNK_TARGET_CHARS = 2000   # ~500 tokens at 4 chars/token
CHUNK_OVERLAP_CHARS = 300   # ~75 tokens overlap between consecutive chunks
EMBED_BATCH_SIZE = 32       # max texts per embedding API call


# ---------------------------------------------------------------------------
# Chunker
# ---------------------------------------------------------------------------


def _chunk_markdown(markdown: str) -> list[str]:
    """Split *markdown* into overlapping chunks suitable for embedding.

    Strategy:
      1. Split on heading boundaries (##, ###, ####) to keep semantic units.
      2. If a unit is still larger than CHUNK_TARGET_CHARS split further on
         blank-line paragraph boundaries.
      3. If a paragraph is still too long, split on sentence boundaries.
      4. Accumulate chunks with CHUNK_OVERLAP_CHARS trailing overlap so that
         context is not lost at chunk edges.
    """
    if not markdown:
        return []

    # ── Step 1: split on headings ──────────────────────────────────
    heading_re = re.compile(r"^(#{1,4}\s+.+)$", re.MULTILINE)
    sections: list[str] = []
    last_end = 0
    for m in heading_re.finditer(markdown):
        if m.start() > last_end:
            sections.append(markdown[last_end : m.start()].strip())
        last_end = m.start()
    sections.append(markdown[last_end:].strip())
    sections = [s for s in sections if s]

    # ── Step 2/3: further split large sections ─────────────────────
    raw_chunks: list[str] = []
    for section in sections:
        if len(section) <= CHUNK_TARGET_CHARS:
            raw_chunks.append(section)
            continue
        # Split on double newline (paragraphs)
        paras = [p.strip() for p in section.split("\n\n") if p.strip()]
        for para in paras:
            if len(para) <= CHUNK_TARGET_CHARS:
                raw_chunks.append(para)
            else:
                # Split on sentence endings
                sentences = re.split(r"(?<=[.!?])\s+", para)
                buf = ""
                for sent in sentences:
                    if len(buf) + len(sent) + 1 > CHUNK_TARGET_CHARS and buf:
                        raw_chunks.append(buf.strip())
                        buf = sent
                    else:
                        buf = buf + " " + sent if buf else sent
                if buf:
                    raw_chunks.append(buf.strip())

    if not raw_chunks:
        # fallback: return whole document as single chunk
        return [markdown[: CHUNK_TARGET_CHARS * 4]]

    # ── Step 4: add overlap ────────────────────────────────────────
    overlapped: list[str] = []
    for i, chunk in enumerate(raw_chunks):
        if i == 0:
            overlapped.append(chunk)
        else:
            tail = raw_chunks[i - 1][-CHUNK_OVERLAP_CHARS:]
            overlapped.append(tail + "\n\n" + chunk)

    return overlapped


# ---------------------------------------------------------------------------
# Embedder
# ---------------------------------------------------------------------------


def _make_embedding_client(cfg: EmbeddingConfig):
    """Return an openai.OpenAI client configured for the embedding endpoint."""
    from openai import OpenAI

    return OpenAI(
        base_url=cfg.base_url or None,
        api_key=cfg.api_key or "sk-placeholder",
    )


def _embed_batch(texts: list[str], client, model: str) -> list[list[float]]:
    """Embed *texts* in a single API call. Returns one vector per text."""
    if not texts:
        return []
    resp = client.embeddings.create(model=model, input=texts)
    # Sort by index to guarantee order matches input
    items = sorted(resp.data, key=lambda x: x.index)
    return [item.embedding for item in items]


# ---------------------------------------------------------------------------
# Public indexer
# ---------------------------------------------------------------------------


class Indexer:
    """Chunks and indexes documents into LanceDB + SQLite FTS5.

    Usage::

        indexer = Indexer()
        indexer.index_document(doc_id, markdown)
        indexer.remove_document(doc_id)
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    # ----------------------------------------------------------------
    def _embedding_enabled(self) -> bool:
        cfg = self._settings.embedding
        return bool(cfg.model and cfg.base_url)

    def _client_and_model(self):
        cfg = self._settings.embedding
        return _make_embedding_client(cfg), cfg.model

    # ----------------------------------------------------------------
    def chunk(self, markdown: str) -> list[str]:
        """Public helper: split *markdown* into chunks."""
        return _chunk_markdown(markdown)

    # ----------------------------------------------------------------
    def index_document(self, doc_id: str, markdown: str) -> int:
        """Chunk + embed *markdown* and store results in LanceDB.

        Returns the number of chunks indexed.
        If embedding is not configured the vector store is skipped
        (FTS is always updated via SQLite triggers).
        """
        chunks = _chunk_markdown(markdown)
        if not chunks:
            return 0

        if not self._embedding_enabled():
            # FTS-only path: SQLite triggers handle FTS on INSERT/UPDATE
            return len(chunks)

        client, model = self._client_and_model()
        table = get_lance_table()

        # Remove any stale vectors for this doc first
        self._delete_from_lance(doc_id, table)

        # Embed in batches
        vectors: list[list[float]] = []
        for i in range(0, len(chunks), EMBED_BATCH_SIZE):
            batch = chunks[i : i + EMBED_BATCH_SIZE]
            vectors.extend(_embed_batch(batch, client, model))

        # Build records for LanceDB
        rows = [
            {
                "id": f"{doc_id}__{i}",
                "doc_id": doc_id,
                "chunk_index": i,
                "content": chunk,
                "vector": vec,
            }
            for i, (chunk, vec) in enumerate(zip(chunks, vectors))
        ]

        table.add(rows)
        return len(rows)

    # ----------------------------------------------------------------
    def remove_document(self, doc_id: str) -> None:
        """Remove all vector chunks for *doc_id* from LanceDB."""
        if not self._embedding_enabled():
            return
        table = get_lance_table()
        self._delete_from_lance(doc_id, table)

    # ----------------------------------------------------------------
    def reindex_all(self) -> dict[str, int]:
        """Re-index every document currently in the vault.

        Returns a dict mapping doc_id -> chunk_count.
        """
        from ..core.vault import vault

        results: dict[str, int] = {}
        docs = vault.list_documents()
        for meta in docs:
            # vault.list_documents() returns dicts keyed by "doc_id" (not "id")
            doc_id = meta.get("doc_id") or meta.get("id")
            if not doc_id:
                continue
            result = vault.get_document(doc_id)
            if result is None:
                continue
            content, _ = result
            count = self.index_document(doc_id, content)
            results[doc_id] = count
        return results

    # ----------------------------------------------------------------
    @staticmethod
    def _delete_from_lance(doc_id: str, table) -> None:
        """Remove all rows for *doc_id* from a LanceDB table."""
        try:
            table.delete(f"doc_id = '{doc_id}'")
        except Exception:
            pass  # table may be empty on first run


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_indexer: Indexer | None = None


def get_indexer() -> Indexer:
    """Return the application-wide Indexer singleton."""
    global _indexer
    if _indexer is None:
        _indexer = Indexer()
    return _indexer
