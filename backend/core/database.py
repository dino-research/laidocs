"""SQLite + LanceDB database layer for LAIDocs.

SQLite: document metadata, folder tree, FTS5 full-text index.
LanceDB: vector embeddings for semantic (dense) search.
"""

from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Generator

from .config import LAIDOCS_HOME

DB_PATH = LAIDOCS_HOME / "data" / "laidocs.db"
LANCE_PATH = str(LAIDOCS_HOME / "data" / "vectors.lance")

# ---------------------------------------------------------------------------
# SQLite schema
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS folders (
    path TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_path TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    folder TEXT NOT NULL,
    filename TEXT NOT NULL,
    title TEXT,
    source_type TEXT NOT NULL CHECK(source_type IN ('file', 'url')),
    original_path TEXT,
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (folder) REFERENCES folders(path)
);

CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
    title,
    content,
    content=documents,
    content_rowid=rowid
);

-- Triggers to keep FTS in sync with documents table
CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
    INSERT INTO documents_fts(rowid, title, content)
    VALUES (new.rowid, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, title, content)
    VALUES ('delete', old.rowid, old.title, old.content);
END;

CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, title, content)
    VALUES ('delete', old.rowid, old.title, old.content);
    INSERT INTO documents_fts(rowid, title, content)
    VALUES (new.rowid, new.title, new.content);
END;
"""


def init_db() -> None:
    """Create DB file and all tables if they do not exist yet."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(str(DB_PATH)) as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.executescript(_SCHEMA)


# ---------------------------------------------------------------------------
# SQLite connection helpers
# ---------------------------------------------------------------------------


@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
    """Yield a SQLite connection suitable for a single request."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA foreign_keys=ON")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def db_dependency() -> Generator[sqlite3.Connection, None, None]:
    """FastAPI Depends-compatible wrapper around get_db()."""
    gen = get_db()
    try:
        yield next(gen)
    finally:
        try:
            next(gen)
        except StopIteration:
            pass


# ---------------------------------------------------------------------------
# LanceDB vector store
# ---------------------------------------------------------------------------

_lance_table_cache: object | None = None
_lance_lock = threading.Lock()


def get_lance_table():
    """Return (and lazily create) the LanceDB 'chunks' table.

    Columns:
        id          -- chunk id  "<doc_id>__<chunk_index>"
        doc_id      -- parent document id
        chunk_index -- position within the document  (int32)
        content     -- raw text of this chunk
        vector      -- embedding vector  (lancedb vector type)

    Thread-safe: a lock prevents race conditions when multiple background
    tasks call this concurrently.  Importing lancedb/pyarrow is deferred
    so that the rest of the app works even when these packages are absent.
    """
    global _lance_table_cache

    if _lance_table_cache is not None:
        return _lance_table_cache

    with _lance_lock:
        # Double-check after acquiring lock
        if _lance_table_cache is not None:
            return _lance_table_cache

        import lancedb
        import pyarrow as pa

        db = lancedb.connect(LANCE_PATH)

        if "chunks" not in db.table_names():
            schema = pa.schema(
                [
                    pa.field("id", pa.string()),
                    pa.field("doc_id", pa.string()),
                    pa.field("chunk_index", pa.int32()),
                    pa.field("content", pa.string()),
                    pa.field("vector", pa.list_(pa.float32())),
                ]
            )
            _lance_table_cache = db.create_table("chunks", schema=schema)
        else:
            _lance_table_cache = db.open_table("chunks")

        return _lance_table_cache


def invalidate_lance_cache() -> None:
    """Reset the cached LanceDB table handle (useful after schema changes)."""
    global _lance_table_cache
    _lance_table_cache = None
