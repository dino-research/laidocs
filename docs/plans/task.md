# DeepAgents Upgrade — Task Tracker

| # | Task | Status |
|---|------|--------|
| 1 | Install DeepAgents Dependencies | done |
| 2 | Create Chat History Service (Display Layer) | done |
| 3 | Create DeepAgent Service | done |
| 4 | Update Chat API Endpoints | done |
| 5 | Update Frontend — Session Support & History | done |
| 6 | End-to-End Verification | done |

## Code Review Fixes

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| CR-1 | Fix thread-unsafe `_tool_context` → `contextvars` | Critical | [x] |
| CR-2 | Fix sync blocking `_select_nodes` → `asyncio.to_thread` | Critical | [x] |
| CR-3 | Wire `reset_agent()` to settings update endpoint | Important | [x] |
| CR-4 | Add DB index on `chat_messages(doc_id)` | Important | [x] |
| CR-5 | Move mid-file `MemorySaver` import to top | Important | [x] |
| CR-6 | Add error handling on "New Session" button | Minor | [x] |
| CR-7 | Reset agent checkpointer on `clearChatHistory` | Minor | [x] |
| CR-8 | Fix misleading "keyed by thread" comment | Minor | [x] |
