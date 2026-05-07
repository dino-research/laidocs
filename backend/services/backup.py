"""Backup service — export/import .laidocs-backup archives."""

from __future__ import annotations

import json
import os
import shutil
import sqlite3
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..core.config import LAIDOCS_HOME
from ..core.database import DB_PATH, init_db
from ..core.vault import VAULT_DIR, SYSTEM_DIRS

MANIFEST_NAME = "manifest.json"
FORMAT_VERSION = 1
APP_VERSION = "1.0.0"


# ── Stats helpers ──────────────────────────────────────────────────


def _count_meta_files(directory: Path) -> int:
    """Count .meta.json files in directory tree (= document count)."""
    if not directory.exists():
        return 0
    return sum(1 for _ in directory.rglob("*.meta.json"))


def _count_chat_messages() -> int:
    if not DB_PATH.exists():
        return 0
    conn = sqlite3.connect(str(DB_PATH))
    try:
        row = conn.execute("SELECT COUNT(*) FROM chat_messages").fetchone()
        return row[0] if row else 0
    except sqlite3.OperationalError:
        return 0
    finally:
        conn.close()


def _count_folders() -> int:
    if not DB_PATH.exists():
        return 0
    conn = sqlite3.connect(str(DB_PATH))
    try:
        row = conn.execute("SELECT COUNT(*) FROM folders").fetchone()
        return row[0] if row else 0
    except sqlite3.OperationalError:
        return 0
    finally:
        conn.close()


def get_vault_stats() -> dict[str, Any]:
    """Return current vault statistics for the Data tab."""
    return {
        "folders": _count_folders(),
        "documents": _count_meta_files(VAULT_DIR),
        "chat_messages": _count_chat_messages(),
    }


# ── Manifest ───────────────────────────────────────────────────────


def _build_manifest() -> dict[str, Any]:
    return {
        "format_version": FORMAT_VERSION,
        "app_version": APP_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "stats": get_vault_stats(),
    }


# ── Export ─────────────────────────────────────────────────────────


def export_backup(target_path: str) -> dict[str, Any]:
    """Create a .laidocs-backup archive at target_path."""
    target = Path(target_path)
    target.parent.mkdir(parents=True, exist_ok=True)

    manifest = _build_manifest()

    with zipfile.ZipFile(str(target), "w", zipfile.ZIP_DEFLATED) as zf:
        # Write manifest
        zf.writestr(MANIFEST_NAME, json.dumps(manifest, indent=2, ensure_ascii=False))

        # Add vault directory
        if VAULT_DIR.exists():
            for file_path in VAULT_DIR.rglob("*"):
                if file_path.is_file():
                    arc_name = "vault/" + str(file_path.relative_to(VAULT_DIR))
                    zf.write(str(file_path), arc_name)

        # Add database
        if DB_PATH.exists():
            zf.write(str(DB_PATH), "data/laidocs.db")

    file_size = target.stat().st_size
    return {"success": True, "file_size": file_size, "stats": manifest["stats"]}


# ── Preview ────────────────────────────────────────────────────────


def preview_backup(source_path: str) -> dict[str, Any]:
    """Read manifest from a backup file without modifying data."""
    source = Path(source_path)
    if not source.exists():
        return {"valid": False, "error": "File not found"}

    try:
        with zipfile.ZipFile(str(source), "r") as zf:
            if MANIFEST_NAME not in zf.namelist():
                return {"valid": False, "error": "Invalid backup: missing manifest"}

            manifest = json.loads(zf.read(MANIFEST_NAME))

            if manifest.get("format_version", 0) > FORMAT_VERSION:
                return {
                    "valid": False,
                    "error": (
                        f"Backup version {manifest['format_version']} is newer "
                        f"than supported ({FORMAT_VERSION}). Please update LAIDocs."
                    ),
                }

            return {"valid": True, "manifest": manifest}
    except zipfile.BadZipFile:
        return {"valid": False, "error": "Corrupt or invalid backup file"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


# ── Import ─────────────────────────────────────────────────────────


def import_backup(source_path: str, mode: str) -> dict[str, Any]:
    """Import data from a backup file. mode: 'replace' or 'merge'."""
    preview = preview_backup(source_path)
    if not preview.get("valid"):
        raise ValueError(preview.get("error", "Invalid backup"))

    source = Path(source_path)
    if mode == "replace":
        return _import_replace(source)
    elif mode == "merge":
        return _import_merge(source)
    else:
        raise ValueError(f"Invalid mode: {mode}")


def _extract_vault_files(zf: zipfile.ZipFile) -> None:
    """Extract vault/ entries from zip to VAULT_DIR."""
    for name in zf.namelist():
        if name.startswith("vault/") and not name.endswith("/"):
            rel = name[len("vault/"):]
            dest = VAULT_DIR / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(name) as src:
                dest.write_bytes(src.read())


def _extract_database(zf: zipfile.ZipFile) -> None:
    """Extract data/laidocs.db from zip to DB_PATH."""
    if "data/laidocs.db" in zf.namelist():
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        with zf.open("data/laidocs.db") as src:
            DB_PATH.write_bytes(src.read())


def _import_replace(source: Path) -> dict[str, Any]:
    """Replace all data with backup contents."""
    with zipfile.ZipFile(str(source), "r") as zf:
        manifest = json.loads(zf.read(MANIFEST_NAME))

        # Clear vault (except recreate the dir)
        if VAULT_DIR.exists():
            shutil.rmtree(VAULT_DIR)
        VAULT_DIR.mkdir(parents=True, exist_ok=True)

        # Clear database
        if DB_PATH.exists():
            DB_PATH.unlink()

        # Extract everything
        _extract_vault_files(zf)
        _extract_database(zf)

    # Reinitialize DB (apply any missing migrations)
    init_db()

    # Ensure unsorted folder always exists
    (VAULT_DIR / "unsorted").mkdir(parents=True, exist_ok=True)

    return {
        "success": True,
        "mode": "replace",
        "imported": manifest.get("stats", {}),
    }


def _import_merge(source: Path) -> dict[str, Any]:
    """Merge backup data with existing data, skipping duplicate doc_ids."""
    imported_docs = 0
    skipped = 0

    # Collect existing doc_ids from local vault
    existing_ids: set[str] = set()
    for meta_file in VAULT_DIR.rglob("*.meta.json"):
        try:
            data = json.loads(meta_file.read_text(encoding="utf-8"))
            if "doc_id" in data:
                existing_ids.add(data["doc_id"])
        except (json.JSONDecodeError, OSError):
            continue

    with zipfile.ZipFile(str(source), "r") as zf:
        # Build map of backup meta files
        backup_metas: dict[str, dict] = {}
        for name in zf.namelist():
            if name.startswith("vault/") and name.endswith(".meta.json"):
                try:
                    data = json.loads(zf.read(name))
                    backup_metas[name] = data
                except (json.JSONDecodeError, KeyError):
                    continue

        # Import documents that don't exist locally
        for meta_name, meta_data in backup_metas.items():
            doc_id = meta_data.get("doc_id", "")
            if doc_id in existing_ids:
                skipped += 1
                continue

            # Copy meta file
            rel = meta_name[len("vault/"):]
            dest = VAULT_DIR / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(zf.read(meta_name))

            # Copy corresponding .md file
            md_name = meta_name.replace(".meta.json", "")
            if md_name in zf.namelist():
                md_rel = md_name[len("vault/"):]
                md_dest = VAULT_DIR / md_rel
                md_dest.write_bytes(zf.read(md_name))

            imported_docs += 1

        # Copy missing asset files
        for name in zf.namelist():
            if name.startswith("vault/assets/") and not name.endswith("/"):
                rel = name[len("vault/"):]
                dest = VAULT_DIR / rel
                if not dest.exists():
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(zf.read(name))

        # Merge database records for new documents
        if "data/laidocs.db" in zf.namelist():
            with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
                tmp.write(zf.read("data/laidocs.db"))
                tmp_path = tmp.name
            try:
                _merge_database(tmp_path, existing_ids)
            finally:
                os.unlink(tmp_path)

    # Sync vault folders to DB
    _sync_vault_folders_to_db()

    return {
        "success": True,
        "mode": "merge",
        "imported": {"documents": imported_docs, "skipped": skipped},
    }


# ── Database merge helpers ─────────────────────────────────────────


def _merge_database(backup_db_path: str, existing_ids: set[str]) -> None:
    """Merge document and chat records from backup DB for new documents only."""
    from ..core.database import get_db

    backup_conn = sqlite3.connect(backup_db_path)
    backup_conn.row_factory = sqlite3.Row

    try:
        # Merge documents table
        try:
            rows = backup_conn.execute("SELECT * FROM documents").fetchall()
            with get_db() as conn:
                for row in rows:
                    if row["id"] not in existing_ids:
                        conn.execute(
                            """INSERT OR IGNORE INTO documents
                               (id, folder, filename, title, source_type,
                                original_path, content, tree_index,
                                created_at, updated_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                            (
                                row["id"], row["folder"], row["filename"],
                                row["title"], row["source_type"],
                                row["original_path"], row["content"],
                                row["tree_index"], row["created_at"],
                                row["updated_at"],
                            ),
                        )
        except sqlite3.OperationalError:
            pass  # Table might not exist in backup

        # Merge chat messages for new documents only
        try:
            rows = backup_conn.execute("SELECT * FROM chat_messages").fetchall()
            with get_db() as conn:
                for row in rows:
                    if row["doc_id"] not in existing_ids:
                        conn.execute(
                            """INSERT INTO chat_messages
                               (doc_id, session_id, role, content, created_at)
                               VALUES (?, ?, ?, ?, ?)""",
                            (
                                row["doc_id"], row["session_id"], row["role"],
                                row["content"], row["created_at"],
                            ),
                        )
        except sqlite3.OperationalError:
            pass  # Table might not exist in backup
    finally:
        backup_conn.close()


def _sync_vault_folders_to_db() -> None:
    """Ensure all vault subdirectories are registered in the folders table."""
    from ..core.database import get_db

    with get_db() as conn:
        for item in VAULT_DIR.iterdir():
            if item.is_dir() and item.name not in SYSTEM_DIRS:
                rel = str(item.relative_to(VAULT_DIR))
                conn.execute(
                    "INSERT OR IGNORE INTO folders (path, name) VALUES (?, ?)",
                    (rel, item.name),
                )
