"""RAG pipeline using PageIndex tree reasoning.

Two-step retrieval:
  1. LLM reads tree structure (titles + summaries) → selects relevant node_ids
  2. Backend fetches text from selected nodes → LLM generates answer
"""

from __future__ import annotations

import asyncio
import json
import re
from typing import AsyncGenerator

from ..core.config import Settings, get_settings
from ..core.database import get_db
from ..services.tree_index import find_nodes_by_ids, remove_fields

# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

_NODE_SELECT_PROMPT = """\
Given this document's tree structure, identify which sections are most \
relevant to answer the user's question. Return ONLY a JSON array of \
node_ids, ordered by relevance. Select 1-5 nodes maximum.

Document Structure:
{structure}

Question: {question}

Return format: ["0003", "0007"]"""

_SYSTEM_PROMPT = """\
You are a helpful document assistant. Your task is to answer questions \
about a specific document.

Rules:
1. Base your answer ONLY on the document context provided below.
2. If the context does not contain enough information, say so clearly.
3. Cite specific section titles when relevant.
4. Keep your answer concise and well-structured.
5. Do NOT make up information not in the context."""

MAX_CONTEXT_CHARS = 12_000


# ---------------------------------------------------------------------------
# Context retrieval
# ---------------------------------------------------------------------------


def _get_tree_index(doc_id: str) -> dict | None:
    """Load the tree index JSON for a document from SQLite."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT tree_index FROM documents WHERE id=?", (doc_id,)
        ).fetchone()
    if row and row[0]:
        try:
            return json.loads(row[0])
        except (json.JSONDecodeError, TypeError):
            return None
    return None


def _get_document_content(doc_id: str) -> str | None:
    """Load raw markdown content for fallback."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT content FROM documents WHERE id=?", (doc_id,)
        ).fetchone()
    return row[0] if row and row[0] else None


def _build_context_from_nodes(nodes: list[dict]) -> str:
    """Build context string from selected tree nodes."""
    ctx = ""
    for node in nodes:
        title = node.get('title', 'Untitled')
        node_id = node.get('node_id', '?')
        text = node.get('text', '')
        section = f"[Section: {title} (node {node_id})]\n{text}\n\n"
        if len(ctx) + len(section) > MAX_CONTEXT_CHARS:
            break
        ctx += section
    return ctx.strip()


def _select_nodes_sync(tree_index: dict, question: str, settings: Settings) -> list[str]:
    """Step 1: Ask LLM to select relevant node_ids from tree structure."""
    from openai import OpenAI

    structure = tree_index.get('structure', [])
    # Send tree WITHOUT text (only titles + summaries + node_ids)
    structure_no_text = remove_fields(structure, fields=['text'])

    client = OpenAI(
        base_url=settings.llm.base_url or None,
        api_key=settings.llm.api_key or "sk-placeholder",
    )

    prompt = _NODE_SELECT_PROMPT.format(
        structure=json.dumps(structure_no_text, ensure_ascii=False, indent=2),
        question=question,
    )

    resp = client.chat.completions.create(
        model=settings.llm.model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        max_tokens=200,
    )

    raw = resp.choices[0].message.content or "[]"
    # Extract JSON array from response
    match = re.search(r'\[.*?\]', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return []


# ---------------------------------------------------------------------------
# RAG Pipeline
# ---------------------------------------------------------------------------


class RAGPipeline:
    """Document Q&A via tree-reasoning retrieval."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    def _llm_client(self):
        from openai import OpenAI
        cfg = self._settings.llm
        return OpenAI(
            base_url=cfg.base_url or None,
            api_key=cfg.api_key or "sk-placeholder",
        )

    def _get_context(self, doc_id: str, question: str) -> str:
        """Two-step retrieval: select nodes then fetch their text."""
        tree_index = _get_tree_index(doc_id)

        if tree_index and tree_index.get('structure'):
            # Step 1: LLM selects relevant nodes
            node_ids = _select_nodes_sync(tree_index, question, self._settings)

            if node_ids:
                # Step 2: Fetch text from selected nodes
                nodes = find_nodes_by_ids(tree_index['structure'], node_ids)
                if nodes:
                    return _build_context_from_nodes(nodes)

        # Fallback: no tree or no nodes selected → use raw content
        content = _get_document_content(doc_id)
        if content:
            return content[:MAX_CONTEXT_CHARS]
        return ""

    def query(self, doc_id: str, question: str) -> str:
        """Return a complete answer string (non-streaming)."""
        context = self._get_context(doc_id, question)
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

    async def query_stream(self, doc_id: str, question: str) -> AsyncGenerator[str, None]:
        """Yield answer tokens as an async generator (for SSE streaming)."""
        loop = asyncio.get_event_loop()
        context = await loop.run_in_executor(None, self._get_context, doc_id, question)

        messages = [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": f"Document context:\n\n{context}\n\nQuestion: {question}"},
        ]
        client = self._llm_client()
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
# Singleton
# ---------------------------------------------------------------------------

_pipeline: RAGPipeline | None = None


def get_rag_pipeline() -> RAGPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = RAGPipeline()
    return _pipeline
