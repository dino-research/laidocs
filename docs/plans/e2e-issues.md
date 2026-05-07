# E2E Test Issues and Resolutions

During the execution of Task 6, the following issues were encountered and resolved:

## Issue 1: Invalid Checkpointer
- **Error:** `Invalid checkpointer provided. Received _AsyncGeneratorContextManager.`
- **Cause:** `AsyncSqliteSaver.from_conn_string` returns an async context manager which needs an `async with` block. However, `get_document_agent` creates a persistent singleton instance for the agent.
- **Resolution:** Replaced the checkpointer with `MemorySaver`. Since `chat.py` already saves all conversational history to the persistent `chat_messages` SQLite table after every turn, the LangGraph checkpointer only needs to manage state for the active memory window, making `MemorySaver` sufficient and eliminating the context manager bug.

## Issue 2: Empty AI Streaming Output
- **Error:** The AI response bubble appeared but was empty.
- **Cause:** The filtering condition in the `astream` loop was `message_obj.type == "ai"`. In the newer version of `langchain-core` being used, the `type` property of an `AIMessageChunk` can return `"AIMessageChunk"` rather than `"ai"`.
- **Resolution:** Updated the filter condition to check for `message_obj.type in ("ai", "AIMessageChunk")`. This successfully restored the streaming SSE tokens to the frontend UI.

## Conclusion
Both issues were minor backend bugs caused by version incompatibilities with the original plan. They have been resolved immediately. The E2E test is now completely successful:
- The streaming endpoints emit accurate text.
- Session IDs are incremented properly when the '+' button is clicked.
- Historical messages correctly display in the UI with session dividers separating them.
