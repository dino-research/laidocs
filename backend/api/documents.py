"""Document CRUD endpoints -- upload, list, get, update, delete.

Auto-indexing: every mutating endpoint triggers an async background task
that updates the vector index (LanceDB) for the affected document.
"""

from __future__ import annotations

import json as _json
import os
import re
import tempfile
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from ..core.database import get_db
import uuid

from ..core.vault import vault, ASSETS_DIR
from ..services.converter import DoclingConverter
from ..services.crawler import WebCrawler
from ..services.indexer import get_indexer


def _sse(stage: str, **extra) -> str:
    """Format a single Server-Sent Event line."""
    payload = {"stage": stage, **extra}
    return f"data: {_json.dumps(payload)}\n\n"

# ── singletons (lazy) ─────────────────────────────────────────────
# DoclingConverter initialises the Docling pipeline (may load models) and
# WebCrawler starts Playwright — both are deferred until first use so startup
# latency stays low and tests that don't exercise these paths aren't penalised.

_converter: DoclingConverter | None = None
_crawler: WebCrawler | None = None


def get_converter() -> DoclingConverter:
    global _converter
    if _converter is None:
        _converter = DoclingConverter()
    return _converter


def get_crawler() -> WebCrawler:
    global _crawler
    if _crawler is None:
        _crawler = WebCrawler()
    return _crawler

# ── request models ────────────────────────────────────────────────


class CrawlRequest(BaseModel):
    url: str
    folder: str = "unsorted"


class CreateDocumentRequest(BaseModel):
    filename: str
    folder: str = "unsorted"
    title: str | None = None


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
    # Normalise: expose both 'id' (frontend) and 'doc_id' (internal) for
    # compatibility with the React client which expects the 'id' key.
    for doc in docs:
        if "id" not in doc and "doc_id" in doc:
            doc["id"] = doc["doc_id"]
    return docs


@documents_router.post("/create")
async def create_document(body: CreateDocumentRequest):
    """Create a new empty .md document."""
    import asyncio

    doc_id = str(uuid.uuid4())
    filename = body.filename.strip()
    if not filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    if not filename.endswith(".md"):
        filename += ".md"

    title = body.title or filename.removesuffix(".md")
    folder = body.folder or "unsorted"

    meta = await asyncio.to_thread(
        vault.save_document,
        folder=folder,
        filename=filename,
        content="",
        title=title,
        source_type="file",
        original_path="",
        doc_id=doc_id,
    )

    def _db_save():
        with get_db() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO folders (path, name) VALUES (?, ?)",
                (meta.folder, meta.folder.split("/")[-1] or meta.folder),
            )
            conn.execute(
                "INSERT OR REPLACE INTO documents (id, folder, filename, title, source_type, original_path, content) "
                "VALUES (?,?,?,?,?,?,?)",
                (meta.doc_id, meta.folder, meta.filename, meta.title,
                 meta.source_type, meta.original_path, ""),
            )

    await asyncio.to_thread(_db_save)

    return {
        "id": meta.doc_id,
        "title": meta.title,
        "folder": meta.folder,
        "filename": meta.filename,
    }


@documents_router.post("/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    folder: str = Form(""),
):
    """Upload a file, convert to Markdown, and stream progress via SSE."""
    from fastapi.responses import StreamingResponse

    ext = Path(file.filename).suffix.lower() if file.filename else ""
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    # Read file bytes eagerly (before streaming response starts)
    content = await file.read()
    original_filename = file.filename or "document"

    async def _generate():
        import tempfile, os, asyncio

        yield _sse("uploading")

        suffix = Path(original_filename).suffix or ".bin"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        yield _sse("uploaded")

        try:
            doc_id = str(uuid.uuid4())

            yield _sse("converting")
            markdown, title = await asyncio.to_thread(
                get_converter().convert_file,
                tmp_path,
                doc_id=doc_id,
                assets_dir=ASSETS_DIR,
            )
            yield _sse("converted")

            original_stem = Path(original_filename).stem
            if not title or title.startswith("tmp") or title == Path(tmp_path).stem:
                title = original_stem
            clean_filename = original_stem + ".md" if original_stem else (original_filename or "document.md")

            yield _sse("saving")
            meta = await asyncio.to_thread(
                vault.save_document,
                folder=folder or "unsorted",
                filename=clean_filename,
                content=markdown,
                title=title or clean_filename.removesuffix(".md"),
                source_type="file",
                original_path=original_filename,
                doc_id=doc_id,
            )

            def _db_save():
                with get_db() as conn:
                    conn.execute(
                        "INSERT OR IGNORE INTO folders (path, name) VALUES (?, ?)",
                        (meta.folder, meta.folder.split("/")[-1] or meta.folder),
                    )
                    conn.execute(
                        "INSERT OR REPLACE INTO documents (id, folder, filename, title, source_type, original_path, content) "
                        "VALUES (?,?,?,?,?,?,?)",
                        (meta.doc_id, meta.folder, meta.filename, meta.title,
                         meta.source_type, meta.original_path, markdown),
                    )

            await asyncio.to_thread(_db_save)

            background_tasks.add_task(get_indexer().index_document, meta.doc_id, markdown)

            yield _sse("saved",
                       id=meta.doc_id,
                       title=meta.title,
                       folder=meta.folder,
                       filename=meta.filename)
        except Exception as exc:
            yield _sse("error", message=str(exc))
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@documents_router.post("/crawl")
async def crawl_url(background_tasks: BackgroundTasks, body: CrawlRequest):
    """Crawl a URL, convert to Markdown, and stream progress via SSE."""
    from fastapi.responses import StreamingResponse

    parsed = urlparse(body.url)
    if not parsed.scheme or parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Invalid URL: must start with http:// or https://")

    # Capture request data before streaming starts
    url = body.url
    folder = body.folder

    async def _generate():
        import asyncio

        yield _sse("crawling")

        try:
            markdown, title = await get_crawler().crawl(url)
            yield _sse("crawled")

            # Derive a safe filename from the title
            filename = re.sub(r"[^\w\-.]", "-", title)[:50].strip("-") + ".md"
            if filename == ".md":
                filename = "untitled.md"

            yield _sse("saving")
            meta = await asyncio.to_thread(
                vault.save_document,
                folder=folder,
                filename=filename,
                content=markdown,
                title=title,
                source_type="url",
                original_path=url,
            )

            def _db_save():
                with get_db() as conn:
                    conn.execute(
                        "INSERT OR IGNORE INTO folders (path, name) VALUES (?, ?)",
                        (meta.folder, meta.folder.split("/")[-1] or meta.folder),
                    )
                    conn.execute(
                        "INSERT OR REPLACE INTO documents (id, folder, filename, title, source_type, original_path, content) "
                        "VALUES (?,?,?,?,?,?,?)",
                        (meta.doc_id, meta.folder, meta.filename, meta.title,
                         meta.source_type, meta.original_path, markdown),
                    )

            await asyncio.to_thread(_db_save)

            background_tasks.add_task(get_indexer().index_document, meta.doc_id, markdown)

            yield _sse("saved",
                       id=meta.doc_id,
                       title=meta.title,
                       folder=meta.folder,
                       filename=meta.filename)
        except Exception as exc:
            yield _sse("error", message=str(exc))

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


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


@documents_router.post("/reindex")
async def reindex_all_documents(background_tasks: BackgroundTasks):
    """Re-index all documents into the vector store.

    Useful after a schema migration (e.g. the LanceDB vector column was
    recreated with the correct FixedSizeList type).  Runs in a background
    task so the response returns immediately.
    """
    def _do_reindex():
        indexer = get_indexer()
        results = indexer.reindex_all()
        total = sum(results.values())
        print(f"[reindex] Done: {len(results)} documents, {total} chunks")

    background_tasks.add_task(_do_reindex)
    return {"status": "reindex_started"}


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
