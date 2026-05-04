"""Document CRUD endpoints -- upload, list, get, update, delete.

Auto-indexing: every mutating endpoint triggers an async background task
that updates the vector index (LanceDB) for the affected document.
"""

from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from ..core.database import get_db
from ..core.vault import vault
from ..services.converter import DocumentConverter
from ..services.crawler import WebCrawler
from ..services.indexer import get_indexer

# ── singletons ─────────────────────────────────────────────────────

converter = DocumentConverter()
crawler = WebCrawler()

# ── request models ────────────────────────────────────────────────


class CrawlRequest(BaseModel):
    url: str
    folder: str = "unsorted"


# ── allowed file extensions ────────────────────────────────────────

_ALLOWED_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".pptx",
    ".xlsx",
    ".md",
    ".txt",
    ".html",
    ".csv",
}

# ── documents router ───────────────────────────────────────────────

documents_router = APIRouter(prefix="/api/documents", tags=["documents"])


@documents_router.get("/")
async def list_documents(folder: str | None = None):
    """List all documents, optionally filtered by folder."""
    docs = vault.list_documents(folder=folder)
    return docs


@documents_router.post("/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    folder: str = Form(""),
):
    """Upload a file, convert to Markdown, and save to the vault."""
    ext = Path(file.filename).suffix.lower() if file.filename else ""
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    # Save uploaded bytes to a temp file for conversion
    suffix = ext or ".bin"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        markdown, title = converter.convert_file(tmp_path)

        meta = vault.save_document(
            folder=folder or "unsorted",
            filename=file.filename or "document.md",
            content=markdown,
            title=title,
            source_type="file",
            original_path=file.filename or "",
        )

        # Keep SQLite FTS index in sync
        with get_db() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO folders (path, name) VALUES (?, ?)",
                (meta.folder, meta.folder.split("/")[-1] or meta.folder),
            )
            conn.execute(
                "INSERT OR REPLACE INTO documents (id, folder, filename, title, source_type, original_path, content) "
                "VALUES (?,?,?,?,?,?,?)",
                (
                    meta.doc_id,
                    meta.folder,
                    meta.filename,
                    meta.title,
                    meta.source_type,
                    meta.original_path,
                    markdown,
                ),
            )

        # Index into LanceDB in the background (non-blocking)
        background_tasks.add_task(get_indexer().index_document, meta.doc_id, markdown)

        return {
            "id": meta.doc_id,
            "title": meta.title,
            "folder": meta.folder,
            "filename": meta.filename,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Conversion failed: {exc}")
    finally:
        os.unlink(tmp_path)


@documents_router.post("/crawl")
async def crawl_url(background_tasks: BackgroundTasks, body: CrawlRequest):
    """Crawl a URL, convert to Markdown, and save to the vault."""
    parsed = urlparse(body.url)
    if not parsed.scheme or parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Invalid URL: must start with http:// or https://")

    try:
        markdown, title = await crawler.crawl(body.url)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to crawl URL: {exc}") from exc

    # Derive a safe filename from the title
    filename = re.sub(r"[^\w\-.]", "-", title)[:50].strip("-") + ".md"
    if filename == ".md":
        filename = "untitled.md"

    meta = vault.save_document(
        folder=body.folder,
        filename=filename,
        content=markdown,
        title=title,
        source_type="url",
        original_path=body.url,
    )

    with get_db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO folders (path, name) VALUES (?, ?)",
            (meta.folder, meta.folder.split("/")[-1] or meta.folder),
        )
        conn.execute(
            "INSERT OR REPLACE INTO documents (id, folder, filename, title, source_type, original_path, content) "
            "VALUES (?,?,?,?,?,?,?)",
            (
                meta.doc_id,
                meta.folder,
                meta.filename,
                meta.title,
                meta.source_type,
                meta.original_path,
                markdown,
            ),
        )

    # Index into LanceDB in the background
    background_tasks.add_task(get_indexer().index_document, meta.doc_id, markdown)

    return {
        "id": meta.doc_id,
        "title": meta.title,
        "folder": meta.folder,
        "filename": meta.filename,
    }


@documents_router.get("/{doc_id}")
async def get_document(doc_id: str):
    """Get a single document's content and metadata."""
    result = vault.get_document(doc_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Document not found")
    content, meta = result
    return {"content": content, **meta.to_dict()}


@documents_router.put("/{doc_id}")
async def update_document(doc_id: str, body: dict, background_tasks: BackgroundTasks):
    """Update a document's Markdown content."""
    markdown = body.get("content", "")

    result = vault.get_document(doc_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Document not found")

    _, meta = result

    vault.save_document(
        folder=meta.folder,
        filename=meta.filename,
        content=markdown,
        title=meta.title,
        source_type=meta.source_type,
        original_path=meta.original_path,
        doc_id=doc_id,
    )

    with get_db() as conn:
        conn.execute(
            "UPDATE documents SET content=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (markdown, doc_id),
        )

    # Re-index in background
    background_tasks.add_task(get_indexer().index_document, doc_id, markdown)

    return {"id": doc_id, "updated": True}


@documents_router.delete("/{doc_id}")
async def delete_document(doc_id: str, background_tasks: BackgroundTasks):
    """Delete a document from the vault, SQLite, and vector index."""
    try:
        vault.delete_document(doc_id)
        with get_db() as conn:
            conn.execute("DELETE FROM documents WHERE id=?", (doc_id,))
        # Remove vectors in background
        background_tasks.add_task(get_indexer().remove_document, doc_id)
        return {"deleted": True}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Document not found")
