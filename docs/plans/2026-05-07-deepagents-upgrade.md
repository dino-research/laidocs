# DeepAgents Upgrade Implementation Plan

> **UPDATE (Post-Implementation):** Due to concurrency and event loop freeze issues discovered during implementation, the architecture was adjusted:
> 1. `AsyncSqliteSaver` was replaced with `MemorySaver` (in-memory checkpointer) to avoid database lock issues.
> 2. `StoreBackend` uses `InMemoryStore` instead of direct file I/O during agent execution.
> 3. `contextvars.ContextVar` is used instead of a module-level dict to ensure thread-safe context isolation across concurrent async requests.

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Replace the stateless RAG pipeline with a DeepAgents-powered agent that has SOUL (document-grounded only), conversation memory, session management, and long-term user preference learning.

**Architecture:** DeepAgent wraps the existing Tree Reasoning retrieval as a `@tool`. Agent streams tokens via SSE (frontend unchanged). Conversation history stored in SQLite checkpointer (per-doc sessions). User preferences persisted to `~/.laidocs/memories/preferences.md`. Display history stored in separate `chat_messages` SQLite table so all messages remain visible even after session reset.

**Tech Stack:** deepagents, langchain, langchain-openai, langgraph, langgraph-checkpoint-sqlite, FastAPI SSE

**Design doc:** `docs/plans/2026-05-07-deepagents-upgrade-design.md`

---

### Task 1: Install DeepAgents Dependencies

**Files:**
- Modify: `backend/requirements.txt`

**Step 1: Add dependencies to requirements.txt**

```
deepagents>=1.6.0
langchain>=0.4.0
langchain-openai>=0.4.0
langgraph>=0.4.0
langgraph-checkpoint-sqlite>=2.0.0
```

Append these lines to the existing `backend/requirements.txt`.

**Step 2: Install dependencies**

Run: `cd backend && pip install -r requirements.txt`
Expected: All packages install successfully. Verify with `python -c "from deepagents import create_deep_agent; print('OK')"`

**Step 3: Commit**

```bash
git add backend/requirements.txt
git commit -m "feat(chat): add deepagents and langchain dependencies"
```

---

### Task 2: Create Chat History Service (Display Layer)

**Files:**
- Create: `backend/services/chat_history.py`
- Modify: `backend/core/database.py`

**Step 1: Add chat_messages table migration to database.py**

Add to `_MIGRATIONS` list in `backend/core/database.py`:

```python
"""CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id TEXT NOT NULL,
    session_id INTEGER NOT NULL DEFAULT 1,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)""",
```

Note: Use the existing migration pattern where errors are caught silently. Since we use `CREATE TABLE IF NOT EXISTS`, this is safe to re-run.

**Step 2: Create chat_history.py service**

Create `backend/services/chat_history.py`:

```python
"""Chat history service for display-layer message persistence.

This stores ALL messages across ALL sessions for UI display purposes.
Separate from the agent's conversation memory (LangGraph checkpointer)
which only holds the current session.
"""

from __future__ import annotations

import json
from datetime import datetime
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
```

**Step 3: Verify table creation**

Run: `cd backend && python -c "from core.database import init_db; init_db(); print('OK')"`
Expected: No errors, chat_messages table created.

**Step 4: Commit**

```bash
git add backend/core/database.py backend/services/chat_history.py
git commit -m "feat(chat): add chat_messages table and history service"
```

---

### Task 3: Create DeepAgent Service

This is the core task. Create `backend/services/agent.py` with the SOUL prompt, retrieve_context tool, and agent factory.

**Files:**
- Create: `backend/services/agent.py`

**Step 1: Create agent.py**

Create `backend/services/agent.py`:

```python
"""DeepAgents-powered document assistant with SOUL.

Replaces the stateless RAGPipeline with an agent that:
- Answers ONLY from document context (SOUL constraint)
- Maintains conversation memory within sessions (checkpointer)
- Learns user preferences across sessions (file-based memory)
- Manages context window automatically (summarization middleware)
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from deepagents import create_deep_agent
from deepagents.backends import StateBackend, CompositeBackend
from deepagents.backends.store import StoreBackend
from langchain.chat_models import init_chat_model
from langchain_core.tools import tool
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.graph.state import CompiledStateGraph

from ..core.config import Settings, get_settings, LAIDOCS_HOME
from ..core.database import get_db
from ..services.tree_index import find_nodes_by_ids, remove_fields

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

MEMORY_DIR = LAIDOCS_HOME / "memories"
PREFERENCES_FILE = MEMORY_DIR / "preferences.md"
CHECKPOINT_DB = LAIDOCS_HOME / "data" / "checkpoints.db"

# ---------------------------------------------------------------------------
# SOUL System Prompt
# ---------------------------------------------------------------------------

DOCUMENT_SOUL_PROMPT = """\
You are a Document Assistant — a faithful, precise reader of the user's documents.

## Your Identity
You exist to help users understand THEIR documents. You are not a general-purpose AI.
You are a librarian who has read every page of the document and can find any answer within it.

## Core Rules (NON-NEGOTIABLE)
1. **Document-grounded ONLY**: Every claim in your answer MUST come from the document \
context retrieved by your tools. If you cannot find the answer in the document, say so honestly.
2. **No fabrication**: NEVER invent, extrapolate, or assume information not present in the \
retrieved context. "I don't see this in the document" is always a valid answer.
3. **Cite sections**: When answering, reference the section title where you found the information.
4. **Retrieval first**: ALWAYS call the retrieve_context tool before answering any question \
about the document. Never answer from memory alone.

## Response Style
- Be concise and well-structured (use headers, bullets, bold for key terms)
- Match the user's language (if they ask in Vietnamese, answer in Vietnamese)
- When the document is ambiguous, present multiple interpretations clearly

## Memory & Learning
- Read /memories/preferences.md at the start to recall user preferences
- When you notice a clear user preference (language, detail level, format), \
save it to /memories/preferences.md for future conversations
- Only save genuine, repeated preferences — not one-off requests
"""

# ---------------------------------------------------------------------------
# Constants for retrieval
# ---------------------------------------------------------------------------

MAX_CONTEXT_CHARS = 12_000

# ---------------------------------------------------------------------------
# Helper functions (reused from rag.py)
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


def _select_nodes(tree_index: dict, question: str, settings: Settings) -> list[str]:
    """Step 1: Ask LLM to select relevant node_ids from tree structure.

    Uses a separate synchronous LLM call (not the agent) for node selection.
    This keeps the retrieval logic fast and deterministic.
    """
    import re
    from openai import OpenAI

    structure = tree_index.get('structure', [])
    structure_no_text = remove_fields(structure, fields=['text'])

    client = OpenAI(
        base_url=settings.llm.base_url or None,
        api_key=settings.llm.api_key or "sk-placeholder",
    )

    prompt = (
        "Given this document's tree structure, identify which sections are most "
        "relevant to answer the user's question. Return ONLY a JSON array of "
        "node_ids, ordered by relevance. Select 1-5 nodes maximum.\n\n"
        f"Document Structure:\n"
        f"{json.dumps(structure_no_text, ensure_ascii=False, indent=2)}\n\n"
        f"Question: {question}\n\n"
        'Return format: ["0003", "0007"]'
    )

    resp = client.chat.completions.create(
        model=settings.llm.model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        max_tokens=200,
    )

    raw = resp.choices[0].message.content or "[]"
    match = re.search(r'\[.*?\]', raw, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group())
            return [str(nid) for nid in parsed if isinstance(nid, (str, int))]
        except json.JSONDecodeError:
            pass
    return []


# ---------------------------------------------------------------------------
# Custom Tool — Tree Retrieval
# ---------------------------------------------------------------------------

# We store doc_id and settings in a module-level dict keyed by thread.
# This is set before each agent invocation and read by the tool.
_tool_context: dict[str, Any] = {}


@tool
def retrieve_context(question: str) -> str:
    """Search the document for sections relevant to the user's question.

    ALWAYS call this tool before answering any document question.
    Returns the most relevant sections with their titles and content.
    If no relevant sections are found, returns a message saying so.

    Args:
        question: The specific question to search for in the document.
    """
    doc_id = _tool_context.get("doc_id", "")
    settings = _tool_context.get("settings")

    if not doc_id or not settings:
        return "Error: Document context not configured."

    tree_index = _get_tree_index(doc_id)

    if tree_index and tree_index.get('structure'):
        node_ids = _select_nodes(tree_index, question, settings)

        if isinstance(node_ids, list) and len(node_ids) == 0:
            return "No relevant sections found in the document for this question."

        nodes = find_nodes_by_ids(tree_index['structure'], node_ids)
        if nodes:
            return _build_context_from_nodes(nodes)

    # Fallback: no tree index → use raw content
    content = _get_document_content(doc_id)
    if content:
        return content[:MAX_CONTEXT_CHARS]

    return "Document content is empty or not yet processed."


# ---------------------------------------------------------------------------
# Memory initialization
# ---------------------------------------------------------------------------


def _ensure_memory_dir() -> None:
    """Create memory directory and seed preferences file if needed."""
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    if not PREFERENCES_FILE.exists():
        PREFERENCES_FILE.write_text(
            "## User Preferences\n\n(No preferences learned yet)\n",
            encoding="utf-8",
        )


# ---------------------------------------------------------------------------
# Agent Factory
# ---------------------------------------------------------------------------

_checkpointer: AsyncSqliteSaver | None = None


async def _get_checkpointer() -> AsyncSqliteSaver:
    """Get or create the async SQLite checkpointer."""
    global _checkpointer
    if _checkpointer is None:
        CHECKPOINT_DB.parent.mkdir(parents=True, exist_ok=True)
        _checkpointer = AsyncSqliteSaver.from_conn_string(str(CHECKPOINT_DB))
        await _checkpointer.setup()
    return _checkpointer


def _create_model(settings: Settings):
    """Create a LangChain chat model from LAIDocs settings."""
    return init_chat_model(
        model=settings.llm.model,
        model_provider="openai",
        base_url=settings.llm.base_url or None,
        api_key=settings.llm.api_key or "sk-placeholder",
        max_retries=3,
        timeout=120,
    )


_agent: CompiledStateGraph | None = None


async def get_document_agent() -> CompiledStateGraph:
    """Get or create the singleton DeepAgent instance.

    The agent is created once and reused. Per-request state (doc_id, settings)
    is passed via thread-local _tool_context and LangGraph config.
    """
    global _agent
    if _agent is not None:
        return _agent

    settings = get_settings()
    _ensure_memory_dir()
    checkpointer = await _get_checkpointer()

    model = _create_model(settings)

    # CompositeBackend: StateBackend for ephemeral files,
    # route /memories/ to actual disk so preferences persist
    backend = CompositeBackend(
        default=StateBackend(),
        routes={"/memories/": StoreBackend()},
    )

    _agent = create_deep_agent(
        model=model,
        tools=[retrieve_context],
        system_prompt=DOCUMENT_SOUL_PROMPT,
        memory=["/memories/preferences.md"],
        backend=backend,
        checkpointer=checkpointer,
        name="document-assistant",
    )

    return _agent


def set_tool_context(doc_id: str, settings: Settings) -> None:
    """Set the tool context for the current request.

    Must be called before invoking the agent so the retrieve_context
    tool knows which document to search.
    """
    _tool_context["doc_id"] = doc_id
    _tool_context["settings"] = settings


def reset_agent() -> None:
    """Reset the agent singleton (e.g., when settings change)."""
    global _agent
    _agent = None
```

**Step 2: Verify module imports**

Run: `cd backend && python -c "from services.agent import get_document_agent, set_tool_context; print('OK')"`
Expected: `OK` (no import errors)

**Step 3: Commit**

```bash
git add backend/services/agent.py
git commit -m "feat(chat): create DeepAgent service with SOUL prompt and tree retrieval tool"
```

---

### Task 4: Update Chat API Endpoints

Replace the current RAGPipeline usage in `chat.py` with the DeepAgent and add new endpoints for history and session management.

**Files:**
- Modify: `backend/api/chat.py`

**Step 1: Rewrite chat.py**

Replace the entire content of `backend/api/chat.py`:

```python
"""Chat API endpoints for document Q&A via DeepAgents.

Endpoints:
  POST /api/chat/stream          - Stream answer (SSE)
  GET  /api/chat/history/{doc_id} - Load all display messages
  POST /api/chat/new-session/{doc_id} - Start a fresh session
  DELETE /api/chat/history/{doc_id}  - Clear all history
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..core.config import get_settings
from ..services.agent import get_document_agent, set_tool_context, reset_agent
from ..services.chat_history import (
    get_current_session_id,
    get_messages,
    save_message,
    start_new_session,
    delete_messages,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class ChatRequest(BaseModel):
    doc_id: str
    question: str
    session_id: int | None = None  # If None, use current session


class HistoryResponse(BaseModel):
    doc_id: str
    messages: list[dict]


class SessionResponse(BaseModel):
    doc_id: str
    session_id: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/stream")
async def chat_stream(body: ChatRequest):
    """Ask a question about a document (Server-Sent Events stream).

    Each SSE event contains a text delta.  The stream ends with [DONE].
    The agent uses Tree Reasoning retrieval to ground answers in the document.
    """
    settings = get_settings()
    if not settings.llm.model or not settings.llm.base_url:
        raise HTTPException(
            status_code=503,
            detail="LLM is not configured. Please set the LLM endpoint in Settings.",
        )

    # Determine session
    session_id = body.session_id or get_current_session_id(body.doc_id)

    # Set tool context so retrieve_context knows which doc to search
    set_tool_context(body.doc_id, settings)

    async def _event_generator():
        full_response = ""
        try:
            agent = await get_document_agent()
            config = {
                "configurable": {
                    "thread_id": f"doc-{body.doc_id}-s{session_id}",
                }
            }

            # Provide preferences file content if it exists
            from ..services.agent import PREFERENCES_FILE
            files = {}
            if PREFERENCES_FILE.exists():
                files["/memories/preferences.md"] = {
                    "content": PREFERENCES_FILE.read_text(encoding="utf-8"),
                    "encoding": "utf-8",
                }

            stream_input = {
                "messages": [{"role": "user", "content": body.question}],
            }
            if files:
                stream_input["files"] = files

            async for chunk in agent.astream(
                stream_input,
                stream_mode=["messages", "updates"],
                subgraphs=True,
                config=config,
            ):
                if not isinstance(chunk, tuple) or len(chunk) != 3:
                    continue

                namespace, stream_mode, data = chunk

                # Only process messages from the main agent (empty namespace)
                if stream_mode != "messages":
                    continue

                if not isinstance(data, tuple) or len(data) != 2:
                    continue

                message_obj, metadata = data

                # Only emit AI content tokens, skip tool calls and summarization
                if (
                    hasattr(message_obj, 'type') and message_obj.type == "ai"
                    and hasattr(message_obj, 'content') and message_obj.content
                    and not getattr(message_obj, 'tool_call_chunks', None)
                ):
                    # Skip summarization middleware output
                    if isinstance(metadata, dict) and metadata.get("langgraph_checkpoint_ns"):
                        # Subgraph output — skip
                        continue

                    token = message_obj.content
                    full_response += token
                    escaped = token.replace("\n", "\\n")
                    yield f"data: {escaped}\n\n"

        except Exception as exc:
            logger.exception("Chat stream error")
            yield f"data: [ERROR] {exc}\n\n"
        finally:
            # Save messages to display history
            if full_response:
                try:
                    save_message(body.doc_id, session_id, "user", body.question)
                    save_message(body.doc_id, session_id, "assistant", full_response)
                except Exception:
                    logger.exception("Failed to save chat history")
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/history/{doc_id}")
async def get_chat_history(doc_id: str) -> HistoryResponse:
    """Load all messages for a document across all sessions."""
    messages = get_messages(doc_id)
    return HistoryResponse(doc_id=doc_id, messages=messages)


@router.post("/new-session/{doc_id}")
async def new_chat_session(doc_id: str) -> SessionResponse:
    """Start a new conversation session for a document.

    The agent context is reset but all previous messages remain visible.
    """
    new_id = start_new_session(doc_id)
    return SessionResponse(doc_id=doc_id, session_id=new_id)


@router.delete("/history/{doc_id}")
async def clear_chat_history(doc_id: str) -> dict:
    """Clear all chat history for a document."""
    delete_messages(doc_id)
    return {"status": "ok", "doc_id": doc_id}
```

**Step 2: Verify the server starts**

Run: `cd backend && python -c "from api.chat import router; print('Routes:', [r.path for r in router.routes])"`
Expected: Routes include `/stream`, `/history/{doc_id}`, `/new-session/{doc_id}`, `/history/{doc_id}`

**Step 3: Commit**

```bash
git add backend/api/chat.py
git commit -m "feat(chat): upgrade chat API to use DeepAgent with session and history management"
```

---

### Task 5: Update Frontend — Add Session Support and History Loading

**Files:**
- Modify: `src/lib/sidecar.ts`
- Modify: `src/components/ChatPanel.tsx`

**Step 1: Add new API functions to sidecar.ts**

Add after the existing `streamChat` function in `src/lib/sidecar.ts`:

```typescript
// ── Chat history & session management ─────────────────────────────

export interface ChatMessage {
  id: number;
  session_id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export async function getChatHistory(docId: string): Promise<ChatMessage[]> {
  const res = await apiGet<{ messages: ChatMessage[] }>(`/api/chat/history/${docId}`);
  return res.messages;
}

export async function startNewSession(docId: string): Promise<number> {
  const res = await apiPost<{ session_id: number }>(`/api/chat/new-session/${docId}`, {});
  return res.session_id;
}

export async function clearChatHistory(docId: string): Promise<void> {
  await apiDelete(`/api/chat/history/${docId}`);
}
```

Update `streamChat` to accept optional `session_id`:

```typescript
export async function streamChat(
  docId: string,
  question: string,
  onChunk: (text: string) => void,
  sessionId?: number,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doc_id: docId, question, session_id: sessionId ?? null }),
  });
  // ... rest unchanged
```

**Step 2: Update ChatPanel.tsx — Load history and add New Session button**

Update `src/components/ChatPanel.tsx`:

1. Import new functions:
```typescript
import { streamChat, getChatHistory, startNewSession, clearChatHistory } from "../lib/sidecar";
```

2. Add session state and history loading:
```typescript
const [sessionId, setSessionId] = useState<number>(1);

// Load chat history on mount
useEffect(() => {
  getChatHistory(docId).then((history) => {
    if (history.length > 0) {
      const msgs: Message[] = history.map((h) => ({
        id: String(h.id),
        role: h.role,
        content: h.content,
        sessionId: h.session_id,
      }));
      setMessages(msgs);
      setSessionId(Math.max(...history.map(h => h.session_id)));
    }
  }).catch(() => { /* ignore load errors */ });
}, [docId]);
```

3. Add `sessionId` field to `Message` interface:
```typescript
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  sessionId?: number;
}
```

4. Update `sendMessage` to pass `sessionId`:
```typescript
await streamChat(docId, question, (token) => { ... }, sessionId);
```

5. Add "New Session" button in header (next to trash icon):
```tsx
<button
  onClick={async () => {
    const newId = await startNewSession(docId);
    setSessionId(newId);
  }}
  title="New session (fresh context)"
  className="btn-icon"
>
  {/* Plus icon */}
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
</button>
```

6. Add session dividers in message rendering:
```tsx
{messages.map((msg, idx) => {
  const prevSession = idx > 0 ? messages[idx - 1].sessionId : msg.sessionId;
  const showDivider = msg.sessionId !== prevSession;
  return (
    <React.Fragment key={msg.id}>
      {showDivider && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 0", color: "var(--text-faint)", fontSize: 10,
        }}>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span>New Session</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>
      )}
      <MessageBubble message={msg} />
    </React.Fragment>
  );
})}
```

7. Update "Clear" button to clear backend history too:
```typescript
onClick={async () => {
  await clearChatHistory(docId);
  setMessages([]);
  setError(null);
  setSessionId(1);
}}
```

**Step 3: Verify the dev server runs**

Run: `cd /home/dino/Documents/laidocs && pnpm tauri dev`
Expected: App compiles and loads without TypeScript errors.

**Step 4: Commit**

```bash
git add src/lib/sidecar.ts src/components/ChatPanel.tsx
git commit -m "feat(chat): add session management, history loading, and session dividers to chat UI"
```

---

### Task 6: End-to-End Verification

**Step 1: Ensure backend starts cleanly**

Run the backend and verify no import errors. The DeepAgent should initialize on first chat request.

**Step 2: Test basic chat flow**

1. Open a document in LAIDocs
2. Click "Chat" to open the chat panel
3. Ask a question about the document
4. Verify: Agent calls `retrieve_context` tool → answer is grounded in document content
5. Verify: SSE tokens stream correctly into the chat bubble

**Step 3: Test conversation memory (within session)**

1. Ask: "What is this document about?"
2. Follow-up: "Can you elaborate on the second point?"
3. Verify: Agent remembers context from question 1 and answers correctly

**Step 4: Test new session**

1. Click the "+" button (New Session)
2. Ask the same follow-up question: "Can you elaborate on the second point?"
3. Verify: Agent does NOT remember the previous conversation (fresh context)
4. Verify: Previous messages still visible in UI with "New Session" divider

**Step 5: Test history persistence**

1. Close the chat panel
2. Reopen it
3. Verify: All previous messages (from all sessions) are loaded from SQLite

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat(chat): complete DeepAgents upgrade with SOUL, memory, and sessions"
```
