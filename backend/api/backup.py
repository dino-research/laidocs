"""Backup API — export/import .laidocs-backup archives."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os

from ..services.backup import export_backup, import_backup, preview_backup, get_vault_stats

router = APIRouter(prefix="/api/backup", tags=["backup"])


# ── Schemas ────────────────────────────────────────────────────────


class ExportRequest(BaseModel):
    target_path: str


class ImportRequest(BaseModel):
    source_path: str
    mode: str  # "replace" or "merge"


class PreviewRequest(BaseModel):
    source_path: str


# ── Routes ─────────────────────────────────────────────────────────


@router.get("/stats")
async def vault_stats():
    """Return current vault statistics (folder/document/chat counts)."""
    return get_vault_stats()


@router.post("/export")
async def do_export(body: ExportRequest):
    """Create a .laidocs-backup archive at the specified path."""
    if not os.path.isabs(body.target_path):
        raise HTTPException(status_code=400, detail="target_path must be an absolute path")
    try:
        return export_backup(body.target_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/preview")
async def do_preview(body: PreviewRequest):
    """Read and validate a backup file's manifest without modifying data."""
    if not os.path.isabs(body.source_path):
        raise HTTPException(status_code=400, detail="source_path must be an absolute path")
    return preview_backup(body.source_path)


@router.post("/import")
async def do_import(body: ImportRequest):
    """Import data from a backup file using the specified mode."""
    if not os.path.isabs(body.source_path):
        raise HTTPException(status_code=400, detail="source_path must be an absolute path")
    if body.mode not in ("replace", "merge"):
        raise HTTPException(
            status_code=400,
            detail="mode must be 'replace' or 'merge'",
        )
    try:
        return import_backup(body.source_path, body.mode)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
