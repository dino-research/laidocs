"""Document CRUD endpoints — upload, list, get, update, delete."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..core.database import get_db
from ..core.vault import vault
from ..services.converter import DocumentConverter

# ── converter singleton ────────────────────────────────────────────

converter = DocumentConverter()

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
            # Ensure folder row exists (vault is the source of truth)
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


@documents_router.get("/{doc_id}")
async def get_document(doc_id: str):
    """Get a single document's content and metadata."""
    result = vault.get_document(doc_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Document not found")
    content, meta = result
    return {"content": content, **meta.to_dict()}


@documents_router.put("/{doc_id}")
async def update_document(doc_id: str, body: dict):
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

    # Update SQLite FTS index
    with get_db() as conn:
        conn.execute(
            "UPDATE documents SET content=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (markdown, doc_id),
        )

    return {"id": doc_id, "updated": True}


@documents_router.delete("/{doc_id}")
async def delete_document(doc_id: str):
    """Delete a document from the vault and SQLite."""
    try:
        vault.delete_document(doc_id)
        with get_db() as conn:
            conn.execute("DELETE FROM documents WHERE id=?", (doc_id,))
        return {"deleted": True}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Document not found")


# ── stub routers (will be implemented in Phase 2) ─────────────────

search_router = APIRouter(prefix="/api/search", tags=["search"])


@search_router.get("/")
async def search():
    return {"message": "Search API — not yet implemented"}


chat_router = APIRouter(prefix="/api/chat", tags=["chat"])


@chat_router.post("/")
async def chat():
    return {"message": "Chat API — not yet implemented"}
