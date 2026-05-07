# Design: Upgrade Chat-with-Document to LangChain DeepAgents

**Date**: 2026-05-07
**Status**: Approved
**Approach**: Full DeepAgents Harness (Phương án A)

## Problem

Current chat-with-document is stateless — each question is independent, no conversation memory, no user preference learning. The RAG pipeline uses raw OpenAI SDK calls without agent framework, limiting extensibility.

## Goals

1. Agent has SOUL — answers ONLY from document content, never fabricates
2. Conversation memory — follow-up questions work within a session
3. Long-term learning — agent remembers user preferences across sessions
4. Session management — user can start fresh context while keeping chat history visible

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | DeepAgents (Full Harness) | Built-in context engineering, memory, streaming |
| Model Provider | OpenAI-compatible via `init_chat_model` | User configures base_url in Settings |
| Retrieval | Keep Tree Reasoning as `@tool` | Proven logic, minimal risk |
| Memory Storage | File-based (`~/.laidocs/memories/`) | Human-readable, debuggable, fits desktop app |
| Conversation History | SQLite Checkpointer | Per-document threads with session support |
| Display History | SQLite `chat_messages` table | Separate from agent context, always visible |

---

## Architecture

```
Frontend (unchanged) → POST /api/chat/stream → DeepAgent
                                                  ├── SOUL System Prompt
                                                  ├── @tool retrieve_context (reuses tree_index.py)
                                                  ├── Memory (~/.laidocs/memories/preferences.md)
                                                  └── Checkpointer (SQLite, per-doc threads)
```

### File Changes

| File | Action | Description |
|---|---|---|
| `backend/services/agent.py` | NEW | DeepAgent factory, SOUL prompt, retrieve_context tool |
| `backend/services/chat_history.py` | NEW | Display history CRUD (chat_messages table) |
| `backend/api/chat.py` | MODIFY | Use agent.astream() instead of RAGPipeline |
| `backend/services/rag.py` | KEEP | Tree Reasoning logic reused by tool |
| `backend/services/tree_index.py` | KEEP | Unchanged |
| `backend/requirements.txt` | MODIFY | Add deepagents, langchain, langgraph deps |
| Frontend | KEEP | SSE format unchanged, add session UI later |

---

## SOUL System Prompt

```python
DOCUMENT_SOUL_PROMPT = """\
You are a Document Assistant — a faithful, precise reader of the user's documents.

## Your Identity
You exist to help users understand THEIR documents. You are not a general-purpose AI.
You are a librarian who has read every page of the document and can find any answer within it.

## Core Rules (NON-NEGOTIABLE)
1. Document-grounded ONLY: Every claim MUST come from retrieved document context.
2. No fabrication: NEVER invent or extrapolate. "I don't see this in the document" is valid.
3. Cite sections: Reference section titles where information was found.
4. Retrieval first: ALWAYS call retrieve_context tool before answering.

## Response Style
- Concise, well-structured (headers, bullets, bold for key terms)
- Match user's language (Vietnamese question → Vietnamese answer)
- Present multiple interpretations when document is ambiguous

## Memory & Learning
- Read /memories/preferences.md at start for user preferences
- Save genuine, repeated preferences to /memories/preferences.md
- Only save real patterns, not one-off requests
"""
```

---

## Custom Tool — Tree Retrieval

```python
@tool
def retrieve_context(question: str, runtime: ToolRuntime[DocumentContext]) -> str:
    """Search the document for sections relevant to the user's question.
    ALWAYS call this tool before answering any document question."""
    # Reuses: _get_tree_index, _select_nodes_sync, _build_context_from_nodes
    # from existing rag.py
```

- `DocumentContext` dataclass carries `doc_id` + `settings` via ToolRuntime
- Agent decides when/how often to call (can call multiple times for complex questions)
- Returns formatted section text with titles

---

## Memory System — Dual Layer

### Layer 1: Conversation History (Short-term)

- **Storage**: LangGraph `AsyncSqliteSaver` checkpointer
- **Thread strategy**: `thread_id = f"doc-{doc_id}-s{session_number}"`
- **Behavior**: Agent remembers conversation within current session
- **/new session**: Increment session_number → fresh agent context

### Layer 2: User Preferences (Long-term)

- **Storage**: `~/.laidocs/memories/preferences.md`
- **Agent reads**: At conversation start (via `memory=` parameter)
- **Agent writes**: When genuine preference detected (via `edit_file` tool)
- **User control**: Can edit/delete file manually

### Display History (UI-only)

- **Storage**: SQLite `chat_messages` table
- **Schema**: `(id, doc_id, session_id, role, content, created_at)`
- **Behavior**: ALL messages from ALL sessions always visible in UI
- **Session dividers**: Frontend renders `── Session mới ──` between sessions

---

## Streaming Integration

Bridge DeepAgents `agent.astream()` → existing SSE format:

- Filter: Only emit `ai` content tokens (hide tool calls, summarization)
- Format: `data: <escaped_token>\n\n` (unchanged)
- End signal: `data: [DONE]\n\n` (unchanged)
- **Frontend requires zero changes**

---

## New API Endpoints

```
POST /api/chat/stream                    # Updated: uses DeepAgent
GET  /api/chat/history/{doc_id}          # New: load display history
POST /api/chat/new-session/{doc_id}      # New: start fresh session
DELETE /api/chat/history/{doc_id}        # New: clear all history
```

---

## Dependencies (new)

```
deepagents>=1.6.0
langchain>=0.4.0
langchain-openai>=0.4.0
langgraph>=0.4.0
langgraph-checkpoint-sqlite>=2.0.0
```
