"""Chat history service for display-layer message persistence.

This stores ALL messages across ALL sessions for UI display purposes.
Separate from the agent's conversation memory (LangGraph checkpointer)
which only holds the current session.
"""

from __future__ import annotations

from ..core.database import get_db


def get_current_session_id(doc_id: str) -> int:
    """Get the current (latest) session ID for a document."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT MAX(session_id) FROM chat_messages WHERE doc_id = ?",
            (doc_id,),
        ).fetchone()
    return row[0] if row and row[0] else 1


def start_new_session(doc_id: str) -> int:
    """Increment session counter and return the new session ID."""
    current = get_current_session_id(doc_id)
    return current + 1


def save_message(doc_id: str, session_id: int, role: str, content: str) -> None:
    """Save a single message to the display history."""
    with get_db() as conn:
        conn.execute(
            """INSERT INTO chat_messages (doc_id, session_id, role, content)
               VALUES (?, ?, ?, ?)""",
            (doc_id, session_id, role, content),
        )


def get_messages(doc_id: str) -> list[dict]:
    """Load all messages for a document, ordered by creation time."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT id, session_id, role, content, created_at
               FROM chat_messages
               WHERE doc_id = ?
               ORDER BY created_at ASC""",
            (doc_id,),
        ).fetchall()
    return [
        {
            "id": row[0],
            "session_id": row[1],
            "role": row[2],
            "content": row[3],
            "created_at": row[4],
        }
        for row in rows
    ]


def delete_messages(doc_id: str) -> None:
    """Delete all messages for a document."""
    with get_db() as conn:
        conn.execute("DELETE FROM chat_messages WHERE doc_id = ?", (doc_id,))
