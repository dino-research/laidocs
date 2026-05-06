"""Vault file-system manager — folders and markdown documents on disk."""

from __future__ import annotations

import json
import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import LAIDOCS_HOME

VAULT_DIR = LAIDOCS_HOME / "vault"
ASSETS_DIR = VAULT_DIR / "assets"

# System directories that should not appear in user-facing folder listings
SYSTEM_DIRS = {"assets"}

# Protected directories that appear in listings but cannot be deleted or renamed
PROTECTED_DIRS = {"unsorted"}


def _ensure_vault() -> None:
    VAULT_DIR.mkdir(parents=True, exist_ok=True)
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)


def ensure_assets_dir() -> Path:
    """Create and return the vault's assets directory (for extracted images)."""
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    return ASSETS_DIR


# ── data class for documents ────────────────────────────────────────

class DocumentMeta:
    """Thin wrapper around a .meta.json dict."""

    def __init__(self, doc_id: str, folder: str, filename: str, *,
                 title: str = "", source_type: str = "file",
                 original_path: str = "", created_at: str | None = None,
                 updated_at: str | None = None, **extra: Any):
        self.doc_id = doc_id
        self.folder = folder
        self.filename = filename
        self.title = title
        self.source_type = source_type
        self.original_path = original_path
        now = datetime.now(timezone.utc).isoformat()
        self.created_at = created_at or now
        self.updated_at = updated_at or now
        self.extra = extra

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "doc_id": self.doc_id,
            "folder": self.folder,
            "filename": self.filename,
            "title": self.title,
            "source_type": self.source_type,
            "original_path": self.original_path,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }
        d.update(self.extra)
        return d

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> DocumentMeta:
        return cls(**data)


# ── folder helpers ──────────────────────────────────────────────────

def _norm(folder: str) -> str:
    """Normalise a folder path to be relative and without trailing slash."""
    p = Path(folder)
    if p.is_absolute():
        raise ValueError(f"Folder path must be relative: {folder}")
    return str(p).strip("/")


def _folder_path(folder: str) -> Path:
    return VAULT_DIR / folder


# ── VaultManager ────────────────────────────────────────────────────

class VaultManager:
    """Manage markdown documents and folders inside the vault."""

    # ── folders ─────────────────────────────────────────────────

    def create_folder(self, folder: str, name: str | None = None,
                      parent_path: str | None = None) -> dict[str, Any]:
        _ensure_vault()
        folder = _norm(folder)
        fp = _folder_path(folder)
        if fp.exists():
            raise FileExistsError(f"Folder already exists: {folder}")
        fp.mkdir(parents=True, exist_ok=True)
        display_name = name or fp.name
        return {
            "path": folder,
            "name": display_name,
            "parent_path": parent_path,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    def delete_folder(self, folder: str) -> None:
        _ensure_vault()
        folder = _norm(folder)
        if folder in SYSTEM_DIRS:
            raise PermissionError(f"Cannot delete system folder: {folder}")
        if folder in PROTECTED_DIRS:
            raise PermissionError(f"Cannot delete protected folder: {folder}")
        fp = _folder_path(folder)
        if not fp.exists():
            raise FileNotFoundError(f"Folder not found: {folder}")
        shutil.rmtree(fp)

    def rename_folder(self, folder: str, new_folder: str) -> dict[str, Any]:
        _ensure_vault()
        folder = _norm(folder)
        new_folder = _norm(new_folder)
        if folder in SYSTEM_DIRS:
            raise PermissionError(f"Cannot rename system folder: {folder}")
        if folder in PROTECTED_DIRS:
            raise PermissionError(f"Cannot rename protected folder: {folder}")
        if new_folder in SYSTEM_DIRS or new_folder in PROTECTED_DIRS:
            raise PermissionError(f"Cannot rename to reserved folder name: {new_folder}")
        src = _folder_path(folder)
        dst = _folder_path(new_folder)
        if not src.exists():
            raise FileNotFoundError(f"Folder not found: {folder}")
        if dst.exists():
            raise FileExistsError(f"Target folder already exists: {new_folder}")
        src.rename(dst)
        return {"old_path": folder, "new_path": new_folder}

    def list_folders(self) -> list[dict[str, Any]]:
        """Return a flat list of all folders in the vault.
        
        Excludes system directories (e.g. 'assets' used for extracted images).
        """
        _ensure_vault()
        result: list[dict[str, Any]] = []
        for root, dirs, _files in os.walk(VAULT_DIR):
            # Prune system dirs so os.walk doesn't descend into them
            dirs[:] = [d for d in dirs if not (Path(root) == VAULT_DIR and d in SYSTEM_DIRS)]
            for d in sorted(dirs):
                full = Path(root) / d
                rel = str(full.relative_to(VAULT_DIR))
                result.append({
                    "path": rel,
                    "name": d,
                    "parent_path": str(Path(rel).parent) if str(Path(rel).parent) != "." else None,
                })
        return result

    # ── documents ───────────────────────────────────────────────

    def save_document(self, folder: str, filename: str, content: str, *,
                      title: str = "", source_type: str = "file",
                      original_path: str = "", doc_id: str | None = None,
                      **extra: Any) -> DocumentMeta:
        _ensure_vault()
        folder = _norm(folder)
        fp = _folder_path(folder)
        fp.mkdir(parents=True, exist_ok=True)

        if doc_id is None:
            doc_id = str(uuid.uuid4())

        # Ensure .md extension
        if not filename.endswith(".md"):
            filename = filename + ".md"

        meta = DocumentMeta(
            doc_id=doc_id,
            folder=folder,
            filename=filename,
            title=title or filename.removesuffix(".md"),
            source_type=source_type,
            original_path=original_path,
            **extra,
        )
        meta.updated_at = datetime.now(timezone.utc).isoformat()

        # Write .md content
        md_path = fp / filename
        md_path.write_text(content, encoding="utf-8")

        # Write .meta.json
        meta_path = fp / (filename + ".meta.json")
        meta_path.write_text(json.dumps(meta.to_dict(), indent=2, ensure_ascii=False), encoding="utf-8")

        return meta

    def get_document(self, doc_id: str) -> tuple[str, DocumentMeta] | None:
        """Return (content, meta) for a document by its ID, or None."""
        _ensure_vault()
        # Search for the meta file across all folders
        for meta_file in VAULT_DIR.rglob("*.meta.json"):
            try:
                data = json.loads(meta_file.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                continue
            if data.get("doc_id") == doc_id:
                md_path = meta_file.with_suffix("").with_suffix("")  # remove .meta.json → .md
                if not md_path.exists():
                    md_path = meta_file.parent / data.get("filename", "")
                content = md_path.read_text(encoding="utf-8") if md_path.exists() else ""
                return content, DocumentMeta.from_dict(data)
        return None

    def delete_document(self, doc_id: str) -> None:
        _ensure_vault()
        for meta_file in VAULT_DIR.rglob("*.meta.json"):
            try:
                data = json.loads(meta_file.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                continue
            if data.get("doc_id") == doc_id:
                md_path = meta_file.parent / data.get("filename", "")
                if md_path.exists():
                    md_path.unlink()
                meta_file.unlink()
                return
        raise FileNotFoundError(f"Document not found: {doc_id}")

    def list_documents(self, folder: str | None = None) -> list[dict[str, Any]]:
        """Return a list of document metadata dicts, optionally filtered by folder."""
        _ensure_vault()
        results: list[dict[str, Any]] = []
        search_root = _folder_path(folder) if folder else VAULT_DIR
        if not search_root.exists():
            return results
        for meta_file in search_root.rglob("*.meta.json"):
            try:
                data = json.loads(meta_file.read_text(encoding="utf-8"))
                results.append(data)
            except (json.JSONDecodeError, OSError):
                continue
        return results


# Singleton
vault = VaultManager()
