"""RAG (Retrieval-Augmented Generation) pipeline for document Q&A.

Retrieves the most relevant chunks from a document and streams/returns
an LLM answer that is grounded in the document content.
"""

from __future__ import annotations

import asyncio
from typing import AsyncGenerator

from ..core.config import Settings, get_settings
from ..core.database import get_db, get_lance_table
from ..services.indexer import _embed_batch, _make_embedding_client

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are a helpful document assistant.  Your task is to answer questions
about a specific document provided by the user.

Rules:
1. Base your answer ONLY on the document context provided below.
2. If the context does not contain enough information to answer, say so clearly
   (e.g., "The document does not appear to cover this topic.").
3. Cite specific sections or headings from the context when relevant.
4. Keep your answer concise and well-structured.
5. Do NOT make up information that is not in the context.
"""

# ---------------------------------------------------------------------------
# Context retrieval helpers
# ---------------------------------------------------------------------------

MAX_CONTEXT_CHARS = 12_000  # ~3 000 tokens at 4 chars/token


def _retrieve_fts_chunks(doc_id: str, query: str, top_k: int = 8) -> list[str]:
    """Return the top-K chunks from *doc_id* using FTS5 within the document."""
    with get_db() as conn:
        # Check if FTS has content for this doc
        rows = conn.execute(
            """
            SELECT snippet(documents_fts, 1, '', '', '...', 50) AS chunk
            FROM documents_fts
            JOIN documents d ON d.rowid = documents_fts.rowid
            WHERE documents_fts MATCH ?
              AND d.id = ?
            ORDER BY rank
            LIMIT ?
            """,
            (query, doc_id, top_k),
        ).fetchall()

        if rows:
            return [r[0] for r in rows if r[0]]

        # Fallback: return beginning of document
        row = conn.execute(
            "SELECT SUBSTR(content, 1, ?) FROM documents WHERE id=?",
            (MAX_CONTEXT_CHARS, doc_id),
        ).fetchone()
        return [row[0]] if row and row[0] else []


def _retrieve_vector_chunks(doc_id: str, query_vector: list[float], top_k: int = 8) -> list[str]:
    """Return the top-K chunks from *doc_id* by vector similarity."""
    table = get_lance_table()
    try:
        df = (
            table.search(query_vector)
            .where(f"doc_id = '{doc_id}'")
            .metric("cosine")
            .limit(top_k)
            .to_pandas()
        )
        return df["content"].tolist()
    except Exception:
        return []


def _build_context(chunks: list[str]) -> str:
    """Concatenate chunks up to MAX_CONTEXT_CHARS."""
    ctx = ""
    for chunk in chunks:
        if len(ctx) + len(chunk) + 2 > MAX_CONTEXT_CHARS:
            break
        ctx += chunk + "\n\n"
    return ctx.strip()


def _get_context(doc_id: str, question: str, settings: Settings) -> str:
    """Retrieve relevant context for *doc_id* / *question*."""
    cfg = settings.embedding
    if cfg.model and cfg.base_url:
        client = _make_embedding_client(cfg)
        vecs = _embed_batch([question], client, cfg.model)
        if vecs:
            chunks = _retrieve_vector_chunks(doc_id, vecs[0], top_k=8)
            if chunks:
                return _build_context(chunks)
    # FTS fallback
    chunks = _retrieve_fts_chunks(doc_id, question, top_k=8)
    return _build_context(chunks)


# ---------------------------------------------------------------------------
# RAG pipeline
# ---------------------------------------------------------------------------


class RAGPipeline:
    """Document Q&A via retrieval-augmented generation."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    def _llm_client(self):
        from openai import OpenAI

        cfg = self._settings.llm
        return OpenAI(
            base_url=cfg.base_url or None,
            api_key=cfg.api_key or "sk-placeholder",
        )

    def query(self, doc_id: str, question: str) -> str:
        """Return a complete answer string (non-streaming)."""
        context = _get_context(doc_id, question, self._settings)
        messages = [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": f"Document context:\n\n{context}\n\nQuestion: {question}"},
        ]
        client = self._llm_client()
        resp = client.chat.completions.create(
            model=self._settings.llm.model,
            messages=messages,
        )
        return resp.choices[0].message.content or ""

    async def query_stream(
        self, doc_id: str, question: str
    ) -> AsyncGenerator[str, None]:
        """Yield answer tokens as an async generator (for SSE streaming)."""
        context = _get_context(doc_id, question, self._settings)
        messages = [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": f"Document context:\n\n{context}\n\nQuestion: {question}"},
        ]
        client = self._llm_client()

        # Run the blocking streaming call in a thread so we don't block the
        # asyncio event loop.
        loop = asyncio.get_event_loop()
        stream = await loop.run_in_executor(
            None,
            lambda: client.chat.completions.create(
                model=self._settings.llm.model,
                messages=messages,
                stream=True,
            ),
        )
        for chunk in stream:
            delta = chunk.choices[0].delta
            if delta and delta.content:
                yield delta.content


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_pipeline: RAGPipeline | None = None


def get_rag_pipeline() -> RAGPipeline:
    """Return the application-wide RAGPipeline singleton."""
    global _pipeline
    if _pipeline is None:
        _pipeline = RAGPipeline()
    return _pipeline
