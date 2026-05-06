"""Folder management API routes."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException

from ..core.database import get_db
from ..core.vault import VAULT_DIR, vault
from ..models.document import DocumentSummary, FolderCreate, FolderNode, FolderRename

router = APIRouter(prefix="/api/folders", tags=["folders"])


# ── Helpers ──────────────────────────────────────────────────────


def _count_documents(folder_path: str) -> int:
    """Count .meta.json files in a vault folder."""
    fp = VAULT_DIR / folder_path
    if not fp.exists():
        return 0
    return len(list(fp.glob("*.meta.json")))


def _get_folder_documents(folder_path: str) -> list[DocumentSummary]:
    """Get document summaries for a specific folder (non-recursive)."""
    import json

    fp = VAULT_DIR / folder_path
    if not fp.exists():
        return []
    docs: list[DocumentSummary] = []
    for meta_file in sorted(fp.glob("*.meta.json")):
        try:
            data = json.loads(meta_file.read_text(encoding="utf-8"))
            docs.append(
                DocumentSummary(
                    id=data.get("doc_id", ""),
                    title=data.get("title", ""),
                    filename=data.get("filename", ""),
                    source_type=data.get("source_type", "file"),
                )
            )
        except (json.JSONDecodeError, OSError):
            continue
    return docs


# ── Routes ───────────────────────────────────────────────────────


@router.get("/", response_model=list[FolderNode])
def list_folders():
    """Return a flat list of all folders with document counts."""
    folders = vault.list_folders()
    result: list[FolderNode] = []
    for f in folders:
        result.append(
            FolderNode(
                path=f["path"],
                name=f["name"],
                parent_path=f.get("parent_path"),
                document_count=_count_documents(f["path"]),
            )
        )
    return result


@router.get("/tree", response_model=list[FolderNode])
def get_folder_tree():
    """Return a nested tree of all folders with their documents."""
    folders = vault.list_folders()

    # Build lookup: path -> FolderNode
    node_map: dict[str, FolderNode] = {}
    for f in folders:
        path = f["path"]
        node_map[path] = FolderNode(
            path=path,
            name=f["name"],
            parent_path=f.get("parent_path"),
            document_count=_count_documents(path),
            documents=_get_folder_documents(path),
        )

    # Build tree: attach children to parents
    roots: list[FolderNode] = []
    for path, node in node_map.items():
        parent = node.parent_path
        if parent and parent in node_map:
            node_map[parent].children.append(node)
        else:
            roots.append(node)

    # Sort: folders alphabetically at each level
    def _sort_tree(nodes: list[FolderNode]) -> list[FolderNode]:
        for n in nodes:
            n.children = _sort_tree(n.children)
        return sorted(nodes, key=lambda n: n.name.lower())

    return _sort_tree(roots)


@router.post("/", response_model=FolderNode, status_code=201)
def create_folder(body: FolderCreate):
    """Create a new folder on disk and register it in SQLite."""
    # Determine parent_path from the given path
    parent = str(Path(body.path).parent) if str(Path(body.path).parent) != "." else None

    # Create on disk via vault
    try:
        info = vault.create_folder(body.path, body.name, parent_path=parent)
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    # Persist to SQLite
    with get_db() as db:
        db.execute(
            "INSERT OR IGNORE INTO folders (path, name, parent_path, created_at) VALUES (?, ?, ?, ?)",
            (info["path"], info["name"], info.get("parent_path"), info["created_at"]),
        )

    return FolderNode(
        path=info["path"],
        name=info["name"],
        parent_path=info.get("parent_path"),
        document_count=0,
    )


@router.put("/rename", response_model=dict)
def rename_folder(body: FolderRename):
    """Rename (move) a folder on disk and update the SQLite record."""
    try:
        info = vault.rename_folder(body.path, body.new_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    # Update SQLite — folder path
    with get_db() as db:
        db.execute("UPDATE folders SET path = ? WHERE path = ?", (info["new_path"], info["old_path"]))
        # Update any documents that reference the old folder path
        db.execute("UPDATE documents SET folder = ? WHERE folder = ?", (info["new_path"], info["old_path"]))

    return info


@router.delete("/{path:path}", status_code=204)
def delete_folder(path: str):
    """Delete a folder, its contents, and all associated SQLite records."""
    try:
        vault.delete_folder(path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    with get_db() as db:
        # Remove documents belonging to this folder (FTS triggers handle cleanup)
        db.execute("DELETE FROM documents WHERE folder = ?", (path,))
        # Remove the folder record
        db.execute("DELETE FROM folders WHERE path = ?", (path,))
