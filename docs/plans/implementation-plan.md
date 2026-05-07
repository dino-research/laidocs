# LAIDocs Implementation Plan

> [!WARNING]
> **This plan is outdated.** The architecture has been migrated from LanceDB + FTS5 to PageIndex tree-based RAG. This document is kept for historical reference. See [page_index_code_review.md](../page_index_code_review.md) for the current architecture.

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build a cross-platform local AI document manager with smart conversion, hybrid search, and RAG Q&A.

**Architecture:** Tauri v2 (Rust shell) + React/TypeScript frontend + Python FastAPI backend running as a sidecar process. IPC via HTTP (localhost:8008). Document storage in a local vault directory with SQLite metadata + LanceDB vectors + FTS5 full-text index.

**Tech Stack:** Tauri v2, React, TypeScript, Tailwind CSS, Python 3.11+, FastAPI, MarkItDown, Crawl4AI, LanceDB, SQLite FTS5, OpenAI SDK (for LLM + embedding + reranker calls)

---

## Phase 0: Project Skeleton (Tasks 1-5)

### Task 1: Create Tauri v2 + React project scaffold

**Objective:** Set up the basic Tauri v2 project with React frontend.

**Files:**
- Create: `src-tauri/` (Tauri scaffold)
- Create: `src/` (React scaffold)
- Create: `package.json`, `pnpm-lock.yaml`

**Step 1: Scaffold project**
```bash
pnpm create tauri-app@latest laidocs --template react-ts
# Options: TypeScript, pnpm, React, Cargo
```

**Step 2: Add Tauri shell plugin**
```bash
cd laidocs
pnpm add @tauri-apps/plugin-shell
pnpm add -D @tauri-apps/cli
```

**Step 3: Add Tailwind CSS v4**
```bash
pnpm add -D tailwindcss @tailwindcss/vite
```
Configure `vite.config.ts` with tailwind plugin. Create `src/index.css` with `@import "tailwindcss"`.

**Step 4: Verify dev mode**
```bash
pnpm tauri dev
```
Expected: Window opens with React default content.

**Step 5: Commit**
```bash
git add -A
git commit -m "feat: scaffold Tauri v2 + React + TypeScript project"
```

---

### Task 2: Configure Tauri for Python sidecar

**Objective:** Set up Tauri to spawn Python backend as a sidecar process.

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/Cargo.toml`

**Step 1: Configure external binary in tauri.conf.json**
```json
{
  "bundle": {
    "externalBin": ["bin/api/main"],
    "targets": "all"
  },
  "app": {
    "windows": [{ "title": "LAIDocs", "width": 1200, "height": 900 }]
  }
}
```

**Step 2: Add shell permissions in capabilities/default.json**
```json
{
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    {
      "identifier": "shell:allow-execute",
      "allow": [{ "name": "bin/api/main", "sidecar": true }]
    }
  ]
}
```

**Step 3: Add Rust dependencies in Cargo.toml**
```toml
[dependencies]
tauri = { version = "2", features = ["devtools"] }
tauri-plugin-shell = "2"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

**Step 4: Implement sidecar lifecycle manager in main.rs**
- `spawn_and_monitor_sidecar()`: Spawn Python process, listen stdout/stderr, emit Tauri events
- `start_sidecar` command
- `shutdown_sidecar` command (graceful via stdin)
- Auto-start on app launch, auto-stop on window close

**Step 5: Create placeholder sidecar directory**
```bash
mkdir -p src-tauri/bin/api
```

**Step 6: Commit**
```bash
git add -A
git commit -m "feat: configure Tauri for Python sidecar lifecycle"
```

---

### Task 3: Create Python FastAPI backend skeleton

**Objective:** Create the Python backend with FastAPI, including stdin shutdown protocol.

**Files:**
- Create: `backend/main.py` (FastAPI entry + stdin shutdown loop)
- Create: `backend/requirements.txt`
- Create: `backend/core/__init__.py`
- Create: `backend/core/config.py` (settings management)
- Create: `backend/api/__init__.py`

**Step 1: Create backend directory structure**
```bash
mkdir -p backend/core backend/api backend/services
```

**Step 2: Write backend/main.py**
- FastAPI app with lifespan context manager
- CORS middleware (allow all origins for dev, restrict for prod)
- stdin listener thread: on "sidecar shutdown" → SIGINT
- Print "[sidecar] Server ready" on startup (signal for frontend)
- Health check endpoint: `GET /api/health`
- Mount routers: `/api/documents`, `/api/folders`, `/api/search`, `/api/chat`, `/api/settings`
- Dev mode: accept `--dev` flag to skip PyInstaller packaging
- UTF-8 handling for Windows

**Step 3: Write backend/core/config.py**
- Use Pydantic Settings for configuration
- Settings: LLM (base_url, api_key, model), Embedding (base_url, api_key, model), Reranker (base_url, api_key, model, enabled)
- Save/load from `~/.laidocs/config.json`
- Default port: 8008

**Step 4: Write backend/requirements.txt**
```
fastapi>=0.115.0
uvicorn[standard]>=0.34.0
pydantic>=2.0
pydantic-settings>=2.0
openai>=1.60.0
markitdown[all]>=0.1.0
crawl4ai>=0.8.0
lancedb>=0.17.0
python-multipart>=0.0.18
aiofiles>=24.0
```

**Step 5: Commit**
```bash
git add -A
git commit -m "feat: create Python FastAPI backend skeleton with sidecar protocol"
```

---

### Task 4: Create frontend IPC client and app shell

**Objective:** Create the React frontend foundation — layout, IPC client, sidecar wait logic.

**Files:**
- Create: `src/lib/sidecar.ts` (IPC client)
- Create: `src/hooks/useSidecar.ts` (sidecar status hook)
- Modify: `src/App.tsx` (app shell layout)
- Create: `src/components/Layout.tsx` (sidebar + main content area)
- Create: `src/components/Sidebar.tsx` (folder tree + nav)

**Step 1: Write src/lib/sidecar.ts**
- `waitForSidecar()`: Listen for "sidecar-stdout" event containing "Server ready"
- `apiGet(path)`, `apiPost(path, body)`, `apiDelete(path)`: Typed HTTP helpers to `http://localhost:8008`
- `streamChat(prompt)`: SSE streaming for LLM responses

**Step 2: Write src/hooks/useSidecar.ts**
- Track sidecar status: "starting" | "ready" | "error"
- Auto-call `waitForSidecar()` on mount
- Retry logic on startup failure

**Step 3: Write Layout component**
- Left sidebar (folder tree, navigation)
- Right main content area (routes)
- Top bar (search bar, settings button)

**Step 4: Write Sidebar component**
- "All Documents" nav item
- Folder tree (expandable/collapsible)
- "Settings" nav item at bottom

**Step 5: Update App.tsx**
- SidecarProvider context
- Route definitions: `/` (documents), `/doc/:id` (editor), `/search`, `/settings`
- Show loading state until sidecar ready

**Step 6: Commit**
```bash
git add -A
git commit -m "feat: create frontend IPC client and app shell layout"
```

---

### Task 5: Implement settings page and config API

**Objective:** Build the settings page where users configure LLM, embedding, and reranker endpoints.

**Files:**
- Create: `backend/api/settings.py` (settings CRUD endpoints)
- Create: `src/pages/Settings.tsx`
- Modify: `backend/main.py` (mount settings router)

**Step 1: Write backend/api/settings.py**
- `GET /api/settings` — return current config
- `PUT /api/settings` — update and persist config
- Validate: required fields for LLM (base_url, api_key, model), embedding (base_url, api_key, model)
- Test connectivity: `POST /api/settings/test-llm` — send a simple prompt to verify LLM works
- Test embedding: `POST /api/settings/test-embedding` — embed a test string

**Step 2: Write Settings page**
- Form sections: LLM Settings, Embedding Settings, Reranker Settings (optional)
- Each section: base_url, api_key (password field), model name
- "Test Connection" button for each section
- "Save" button
- Show connection status (✅ connected / ❌ failed)

**Step 3: Commit**
```bash
git add -A
git commit -m "feat: implement settings page with LLM/embedding/reranker config"
```

---

## Phase 1: Document Management (Tasks 6-9)

### Task 6: Vault storage and folder management API

**Objective:** Create the document vault structure and folder management backend.

**Files:**
- Create: `backend/core/vault.py` (vault filesystem operations)
- Create: `backend/api/folders.py` (folder CRUD endpoints)
- Create: `backend/models/__init__.py`
- Create: `backend/models/document.py` (Pydantic models)

**Step 1: Design vault structure**
```
~/.laidocs/
├── config.json          # App settings
├── vault/               # Document storage
│   ├── folder-a/
│   │   ├── doc1.md
│   │   └── doc1.meta.json  # {original_name, source_type, created_at, ...}
│   └── folder-b/
├── data/
│   ├── laidocs.db       # SQLite (metadata, FTS5 index)
│   └── vectors.lance    # LanceDB (embeddings)
```

**Step 2: Write backend/core/vault.py**
- `VaultManager` class
- `create_folder(path)`, `delete_folder(path)`, `rename_folder(old, new)`
- `list_folders()` → tree structure
- `save_document(folder, filename, markdown_content, metadata)`
- `get_document(doc_id)` → markdown content + metadata
- `delete_document(doc_id)`
- `list_documents(folder)` → list of document metadata

**Step 3: Write Pydantic models**
- `DocumentMetadata`: id, folder, filename, title, source_type (file|url), original_path, created_at, updated_at
- `FolderNode`: id, name, path, children, document_count
- `DocumentCreate`: folder, file (upload) or url
- `DocumentUpdate`: markdown_content

**Step 4: Write backend/api/folders.py**
- `GET /api/folders` — return folder tree
- `POST /api/folders` — create folder
- `PUT /api/folders/{path}` — rename folder
- `DELETE /api/folders/{path}` — delete folder (with documents)

**Step 5: Initialize SQLite with FTS5**
- Create `documents` table with full-text search virtual table
- `CREATE VIRTUAL TABLE documents_fts USING fts5(title, content)`

**Step 6: Commit**
```bash
git add -A
git commit -m "feat: implement vault storage and folder management"
```

---

### Task 7: Document upload and MarkItDown conversion

**Objective:** Implement file upload → MarkItDown conversion → save markdown.

**Files:**
- Create: `backend/services/converter.py` (MarkItDown wrapper)
- Create: `backend/api/documents.py` (document CRUD endpoints)
- Modify: `backend/main.py` (mount documents router)

**Step 1: Write backend/services/converter.py**
- `DocumentConverter` class
- `__init__(self, config)`: Initialize MarkItDown with LLM client if configured
- `convert_file(file_path) → str`: Convert file to markdown using MarkItDown
  - Use `MarkItDown(llm_client=client, llm_model=model, enable_plugins=True)` for LLM-enhanced OCR
  - Handle: PDF, DOCX, PPTX, XLSX
- `convert_url(url) → str`: Placeholder, will be implemented in Task 8
- Extract title from first H1 or filename

**Step 2: Write backend/api/documents.py**
- `POST /api/documents/upload` — upload file, convert, save to vault, index
  - Accept multipart file upload
  - Call converter.convert_file()
  - Save markdown to vault
  - Return document metadata
- `GET /api/documents` — list all documents (with optional folder filter)
- `GET /api/documents/{doc_id}` — get document content + metadata
- `PUT /api/documents/{doc_id}` — update markdown content (after user edits)
- `DELETE /api/documents/{doc_id}` — delete document

**Step 3: Commit**
```bash
git add -A
git commit -m "feat: implement document upload and MarkItDown conversion"
```

---

### Task 8: URL crawl with Crawl4AI

**Objective:** Implement URL → crawl → markdown conversion.

**Files:**
- Create: `backend/services/crawler.py` (Crawl4AI wrapper)
- Modify: `backend/api/documents.py` (add URL crawl endpoint)

**Step 1: Write backend/services/crawler.py**
- `WebCrawler` class
- `__init__(self, config)`: Configure LLM for extraction
- `crawl(url) → str`: Crawl URL and return markdown
  - Use `AsyncWebCrawler` with `CrawlerRunConfig`
  - Enable markdown generation with PruningContentFilter
  - Use LLM for content extraction if configured
  - Handle errors gracefully (timeout, blocked, etc.)
- Extract title from markdown or HTML title tag

**Step 2: Add crawl endpoint**
- `POST /api/documents/crawl` — {url, folder}
  - Validate URL format
  - Call crawler.crawl(url)
  - Save markdown to vault
  - Return document metadata

**Step 3: Commit**
```bash
git add -A
git commit -m "feat: implement URL crawling with Crawl4AI"
```

---

### Task 9: Frontend — Document list and markdown editor

**Objective:** Build the main UI — document list, upload/crawl actions, markdown editor.

**Files:**
- Create: `src/pages/Documents.tsx` (document list + actions)
- Create: `src/pages/DocumentEditor.tsx` (markdown editor)
- Create: `src/components/UploadDialog.tsx`
- Create: `src/components/CrawlDialog.tsx`
- Create: `src/components/MarkdownPreview.tsx`

**Step 1: Write Documents page**
- Display folder tree in sidebar
- Document list for selected folder (or "All Documents")
- Each doc: title, source type icon, created date, preview snippet
- Action buttons: Upload File, Crawl URL, New Folder
- Click document → navigate to editor

**Step 2: Write UploadDialog**
- Drag & drop zone for files
- File type filter: .pdf, .docx, .pptx, .xlsx
- Progress indicator during conversion
- Folder selector dropdown

**Step 3: Write CrawlDialog**
- URL input field
- Folder selector dropdown
- Progress indicator during crawl

**Step 4: Write DocumentEditor page**
- Split view: left = markdown editor, right = rendered preview
- Tab toggle: Edit / Preview / Split
- Auto-save with debounce
- Document metadata display (source, created date)
- Back button to document list

**Step 5: Commit**
```bash
git add -A
git commit -m "feat: build document list, upload/crawl dialogs, and markdown editor"
```

---

## Phase 2: Search & Q&A (Tasks 10-13)

### Task 10: Embedding and indexing pipeline

**Objective:** Create the chunking + embedding + indexing pipeline for documents.

**Files:**
- Create: `backend/services/indexer.py` (chunking + embedding + indexing)
- Create: `backend/core/database.py` (SQLite + LanceDB setup)

**Step 1: Write backend/core/database.py**
- `Database` class
- Initialize SQLite connection with FTS5 virtual table
- Initialize LanceDB table for vector storage
- Schema: LanceDB table with columns [id, doc_id, chunk_index, content, embedding]

**Step 2: Write backend/services/indexer.py**
- `Indexer` class
- `__init__(self, config, db)`: Setup embedding client (OpenAI-compatible)
- `chunk_markdown(markdown: str) -> list[str]`:
  - Semantic chunking: split on headings (H1 > H2 > H3), code blocks, paragraph boundaries
  - Target: ~500-900 tokens per chunk with 15% overlap
  - Keep heading context in each chunk
- `embed_batch(texts: list[str]) -> list[list[float]]`:
  - Call embedding API endpoint
  - Batch processing (configurable batch size)
- `index_document(doc_id: str, markdown: str)`:
  - Chunk markdown
  - Embed all chunks
  - Store in LanceDB
  - Insert into SQLite FTS5
- `remove_document(doc_id: str)`:
  - Remove from LanceDB
  - Remove from FTS5
- `reindex_all()`:
  - Clear all indexes
  - Re-index all documents in vault

**Step 3: Commit**
```bash
git add -A
git commit -m "feat: implement embedding and indexing pipeline"
```

---

### Task 11: Hybrid search (BM25 + Vector + RRF)

**Objective:** Implement hybrid search combining BM25 full-text and vector similarity with Reciprocal Rank Fusion.

**Files:**
- Create: `backend/services/search.py` (hybrid search engine)
- Create: `backend/api/search.py` (search endpoints)

**Step 1: Write backend/services/search.py**
- `SearchEngine` class
- `__init__(self, config, db)`: Setup indexer, optional reranker
- `search(query: str, top_k: int = 10, folder: str = None) -> list[SearchResult]`:
  1. BM25 search via SQLite FTS5 → ranked results with scores
  2. Vector search via LanceDB → embed query, cosine similarity → ranked results
  3. RRF fusion: combine both ranked lists (k=60)
  4. Optional reranking: call reranker API on top-N results
  5. Return sorted results with relevance scores
- `SearchResult`: doc_id, title, folder, snippet, score, highlights

**Step 2: Write backend/api/search.py**
- `POST /api/search` — {query, top_k, folder} → search results
- `POST /api/search/suggestions` — {prefix} → autocomplete suggestions

**Step 3: Commit**
```bash
git add -A
git commit -m "feat: implement hybrid search with BM25 + vector + RRF fusion"
```

---

### Task 12: RAG Q&A pipeline

**Objective:** Implement document Q&A using retrieval-augmented generation.

**Files:**
- Create: `backend/services/rag.py` (RAG pipeline)
- Create: `backend/api/chat.py` (Q&A endpoints)

**Step 1: Write backend/services/rag.py**
- `RAGPipeline` class
- `__init__(self, config, search_engine)`:
  - Setup LLM client (OpenAI-compatible)
  - Reference to search engine for retrieval
- `query(doc_id: str, question: str) -> str`:
  1. Retrieve relevant chunks from the specific document
  2. Build context window (top-K chunks, respect token limit)
  3. Build prompt: system prompt + context + question
  4. Call LLM API
  5. Return answer with source references
- `query_stream(doc_id: str, question: str) -> AsyncGenerator`:
  - Same as above but stream response chunks

**Step 2: Write backend/api/chat.py**
- `POST /api/chat` — {doc_id, question} → answer
- `POST /api/chat/stream` — {doc_id, question} → SSE stream
- System prompt template emphasizing:
  - Answer based ONLY on the provided document context
  - Cite specific sections when possible
  - Say "I don't know" if context doesn't contain the answer

**Step 3: Commit**
```bash
git add -A
git commit -m "feat: implement RAG Q&A pipeline for document chat"
```

---

### Task 13: Frontend — Search and Q&A UI

**Objective:** Build the search interface and document Q&A chat.

**Files:**
- Create: `src/pages/Search.tsx`
- Create: `src/components/ChatPanel.tsx`
- Create: `src/components/SearchResultCard.tsx`
- Modify: `src/components/Layout.tsx` (add search bar)

**Step 1: Write Search page**
- Search input with debounced autocomplete suggestions
- Filter by folder
- Results list: title, folder path, relevance score, snippet with highlights
- Click result → navigate to document editor (scroll to relevant section)

**Step 2: Write ChatPanel component**
- Chat interface: user messages + AI responses
- Streaming response display (typewriter effect)
- Source references (clickable, scroll to section)
- Clear chat history button
- Themed for embedding in DocumentEditor page (slide-in panel)

**Step 3: Integrate into DocumentEditor**
- Add "Chat with this document" button in editor toolbar
- Opens ChatPanel as slide-in from right
- Passes current document ID to chat

**Step 4: Commit**
```bash
git add -A
git commit -m "feat: build search interface and document Q&A chat UI"
```

---

## Phase 3: Polish & Packaging (Tasks 14-16)

### Task 14: Auto-indexing and document lifecycle hooks

**Objective:** Automatically index documents when created/updated/deleted.

**Files:**
- Modify: `backend/api/documents.py` (add indexing calls)
- Modify: `backend/services/indexer.py` (incremental indexing)

**Step 1: Add indexing hooks**
- On document upload → index after save
- On document update → re-index (remove old chunks, add new)
- On document delete → remove from index
- On URL crawl → index after save

**Step 2: Add background indexing**
- Use FastAPI BackgroundTasks for non-blocking indexing
- Show indexing progress in frontend

**Step 3: Commit**
```bash
git add -A
git commit -m "feat: add automatic indexing on document lifecycle events"
```

---

### Task 15: Error handling, logging, and edge cases

**Objective:** Add robust error handling throughout the application.

**Files:**
- Modify: multiple backend files
- Create: `backend/core/exceptions.py`
- Modify: multiple frontend files

**Step 1: Backend error handling**
- Custom exceptions: ConversionError, CrawlError, IndexingError, LLMError
- Global error handler middleware for FastAPI
- Retry logic for LLM/embedding API calls (exponential backoff)
- Graceful degradation: if LLM is down, basic conversion still works (without OCR enhancement)

**Step 2: Frontend error handling**
- Global error boundary
- Toast notifications for errors
- Loading states for all async operations
- Offline indicator (when backend is down)

**Step 3: Commit**
```bash
git add -A
git commit -m "feat: add comprehensive error handling and edge case management"
```

---

### Task 16: PyInstaller packaging and cross-platform build

**Objective:** Package the Python backend as a standalone binary for distribution.

**Files:**
- Create: `backend/laidocs.spec` (PyInstaller spec)
- Modify: `package.json` (build scripts)
- Create: `.github/workflows/build.yml` (CI/CD)

**Step 1: Create PyInstaller spec file**
- Single-file build (-F)
- Include all Python dependencies
- Handle MarkItDown and Crawl4AI data files
- Target triple naming: `main-{target-triple}`

**Step 2: Add build scripts to package.json**
```json
{
  "scripts": {
    "build:sidecar-linux": "pyinstaller -c -F --name main-x86_64-unknown-linux-gnu --distpath src-tauri/bin/api backend/laidocs.spec",
    "build:sidecar-win": "pyinstaller -c -F --name main-x86_64-pc-windows-msvc --distpath src-tauri/bin/api backend/laidocs.spec",
    "build:sidecar-mac": "pyinstaller -c -F --name main-aarch64-apple-darwin --distpath src-tauri/bin/api backend/laidocs.spec",
    "build:app": "pnpm tauri build"
  }
}
```

**Step 3: Commit**
```bash
git add -A
git commit -m "feat: add PyInstaller packaging and build scripts"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| **Phase 0** | 1-5 | Project skeleton, Tauri + React + Python setup, settings |
| **Phase 1** | 6-9 | Document management, conversion, crawling, editor UI |
| **Phase 2** | 10-13 | Embedding, hybrid search, RAG Q&A, search/chat UI |
| **Phase 3** | 14-16 | Auto-indexing, error handling, packaging |

**Total: 16 tasks, estimated 4-6 weeks for a solo developer**

## Key Dependencies

```
# Python
fastapi, uvicorn, pydantic, pydantic-settings
openai (LLM + embedding + reranker API client)
markitdown[all] (document conversion)
crawl4ai (web crawling)
lancedb (vector database)
aiofiles, python-multipart

# Node.js
@tauri-apps/api, @tauri-apps/plugin-shell, @tauri-apps/cli
react, react-dom, react-router-dom
tailwindcss, @tailwindcss/vite
```
