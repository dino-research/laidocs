# LAIDocs — Local AI-powered Document Manager

> Smart document management system running 100% locally. Convert files & URLs to Markdown, organize in custom folders, and chat with documents using a DeepAgents-powered assistant with SOUL (document-grounded only), conversation memory, and session management.

## Features

- **Document Conversion**: PDF, DOCX, PPTX, XLSX, HTML → Markdown (via Docling + optional VLM-enhanced OCR for images)
- **Image Extraction**: Embedded images are automatically extracted and saved as vault assets, referenced as standard Markdown `![img](/assets/...)` links
- **LLM Refinement**: Optional post-conversion OCR cleanup via your configured LLM (falls back gracefully if not set)
- **Web Crawler**: URL → Markdown (via Crawl4AI + LLM-enhanced extraction)
- **Markdown Editor**: Full-featured split editor/preview powered by ByteMD (GFM, TOC, syntax highlighting)
- **Folder Tree**: Custom document organization
- **Document Q&A**: Chat with any document via a DeepAgents assistant that answers ONLY from document context (SOUL constraint)
- **Conversation Memory**: Agent remembers context within a session for follow-up questions
- **Session Management**: Start fresh sessions per document — previous messages remain visible with dividers
- **User Preference Learning**: Agent learns your preferences (language, detail level, format) during the session
- **History Persistence**: All chat messages persist across app restarts in SQLite
- **Upload Progress**: Real-time conversion stage tracking via SSE, displayed in the sidebar
- **Fully Local**: Only connects to your configured LLM API — no data leaves your machine

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Desktop Shell | Tauri v2 (Rust) |
| Frontend | React 19 + TypeScript + Tailwind CSS |
| Backend | Python FastAPI (sidecar) |
| Doc Conversion | Docling >= 2.0 |
| Markdown Editor | ByteMD + @bytemd/plugin-gfm |
| Web Crawling | Crawl4AI |
| Document Index | PageIndex (hierarchical tree index) |
| Chat Agent | DeepAgents (SOUL, memory, tools) |
| Agent Framework | LangChain + LangGraph |
| Database | SQLite (metadata, tree index, chat history) |
| LLM | OpenAI-compatible API (user-configured) |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│               Tauri v2 (Rust Shell)                  │
│  ┌───────────────────────────────────────────────┐  │
│  │           React Frontend (WebView)            │  │
│  │  - Document List / Folder Tree               │  │
│  │  - ByteMD Editor / Preview                   │  │
│  │  - Q&A Chat Interface (sessions + history)   │  │
│  │  - Settings Page                             │  │
│  └──────────────────┬────────────────────────────┘  │
│                     │ HTTP (localhost:8008)           │
│  ┌──────────────────▼────────────────────────────┐  │
│  │          Python FastAPI Backend               │  │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────┐  │  │
│  │  │  Docling │  │ Crawl4AI │  │ DeepAgent  │  │  │
│  │  │ + VLM OCR│  │ + LLM    │  │ (SOUL +    │  │  │
│  │  └──────────┘  └──────────┘  │ Memory +   │  │  │
│  │  ┌──────────┐                │ Sessions)  │  │  │
│  │  │ Tree     │                └────────────┘  │  │
│  │  │ Index    │                ┌────────────┐  │  │
│  │  └──────────┘                │ LangGraph  │  │  │
│  │  ┌──────────┐                │ + LangChain│  │  │
│  │  │  SQLite  │                └────────────┘  │  │
│  │  │ metadata,│  ┌───────────────────────────┐  │  │
│  │  │ tree idx,│  │  Vault (filesystem)      │  │  │
│  │  │ history  │  │  ~/laidocs/vault/        │  │  │
│  │  └──────────┘  └───────────────────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Chat System

The chat system uses a **DeepAgents**-powered assistant with a **SOUL** (System of Understanding and Learning):

- **Document-grounded only**: Every answer must come from the document — the agent says "I don't see this in the document" rather than guessing
- **Tree Reasoning retrieval**: Uses a `retrieve_context` tool that selects relevant sections from the PageIndex tree via LLM node selection
- **Conversation memory**: Within a session, the agent remembers previous questions and answers via LangGraph's MemorySaver checkpointer
- **Session management**: Start fresh sessions per document (new button in chat header) — previous messages remain visible with "New Session" dividers
- **User preference learning**: The agent learns preferences (language, detail level, format) during the session (in-memory) initialized from `~/.laidocs/memories/preferences.md`
- **History persistence**: All messages across all sessions are stored in a `chat_messages` SQLite table and loaded on app reopen

### Chat API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat/stream` | POST | Stream answer via SSE (tokens) |
| `/api/chat/history/{doc_id}` | GET | Load all messages across sessions |
| `/api/chat/new-session/{doc_id}` | POST | Start a fresh session |
| `/api/chat/history/{doc_id}` | DELETE | Clear all history |

## Document Conversion Pipeline

When a file is uploaded:

1. **Docling** converts PDF/DOCX/PPTX/XLSX/HTML to a structured document model
2. **VaultPictureSerializer** extracts embedded images → saved as `<doc_id>_N.png` in `vault/assets/`
3. **MarkdownDocSerializer** serialises the document to Markdown with `![Image N](/assets/...)` references
4. **LLM refinement** (optional) — sends the raw Markdown to your configured LLM to remove OCR noise while preserving all image tags and structure
5. The resulting `.md` file and a `.meta.json` sidecar are written to `vault/<folder>/`
6. **Tree index** is built asynchronously in a background task — parses markdown headings into a hierarchical tree structure with LLM-generated summaries (adapted from [PageIndex](https://github.com/VectifyAI/PageIndex))
7. Assets are served at `http://localhost:8008/assets/<filename>` via FastAPI's `StaticFiles` mount

For PDFs, if a VLM model is configured, Docling can generate image descriptions (`> **Description:** ...`) embedded below each image in the Markdown.

## Getting Started

```bash
# Clone
git clone https://github.com/dino-research/laidocs.git
cd laidocs

# Setup Python backend
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Setup Frontend
cd ..
pnpm install

# Dev mode (starts both frontend + backend)
pnpm tauri dev
```

## Configuration

On first launch, configure in the Settings page:

1. **LLM Endpoint**: OpenAI-compatible API URL + API Key + Model name
   - Used for: web crawl extraction, document Q&A (agent), OCR noise cleanup, PDF image descriptions, tree index summary generation

> All LLM features degrade gracefully — the app works fully offline without any LLM configured. Docling-based conversion and the editor always work. The Q&A feature and tree index require an LLM.

## Supported File Formats

| Format | Conversion | Image Extraction |
|--------|-----------|-----------------|
| PDF | Full layout | (with optional VLM description) |
| DOCX | | |
| PPTX | | |
| XLSX | (text/tables) | — |
| HTML | (text) | — |
| Markdown / TXT / CSV | (pass-through) | — |
| URL | (via Crawl4AI) | — |

## Project Structure

```
laidocs/
├── backend/                  # Python FastAPI sidecar
│   ├── api/                  # Route handlers
│   │   ├── documents.py      # Upload (SSE progress), CRUD, crawl
│   │   ├── folders.py
│   │   ├── chat.py           # Chat API (DeepAgent, sessions, history)
│   │   └── settings.py
│   ├── core/
│   │   ├── config.py         # App settings (pydantic-settings)
│   │   ├── database.py       # SQLite init + migrations
│   │   ├── exceptions.py     # Custom exception types
│   │   └── vault.py          # Filesystem vault manager + ASSETS_DIR
│   ├── services/
│   │   ├── agent.py          # DeepAgent service (SOUL, memory, tree retrieval tool)
│   │   ├── chat_history.py   # Chat message persistence (display layer)
│   │   ├── converter.py      # DoclingConverter (Docling pipeline)
│   │   ├── picture_serializer.py  # VaultPictureSerializer
│   │   ├── crawler.py        # WebCrawler (Crawl4AI)
│   │   ├── tree_index.py     # PageIndex tree builder (adapted)
│   │   ├── rag.py            # RAG helpers (reused by agent.py)
│   ├── main.py               # FastAPI app + startup lifespan
│   └── requirements.txt
├── src/                      # React + TypeScript frontend
│   ├── components/
│   │   ├── Sidebar.tsx         # Folder tree + upload progress display
│   │   ├── UploadDialog.tsx    # File upload dialog
│   │   ├── MarkdownPreview.tsx # ByteMD markdown renderer
│   │   ├── ChatPanel.tsx       # Document Q&A chat (sessions, history, dividers)
│   │   ├── CrawlDialog.tsx     # URL crawl dialog
│   │   ├── Layout.tsx          # App shell layout
│   │   └── TopBar.tsx          # Top navigation bar
│   ├── context/
│   │   ├── FolderContext.tsx    # Folder tree state
│   │   └── UploadContext.tsx    # Upload progress tracking (SSE)
│   ├── lib/
│   │   ├── sidecar.ts          # Backend API client (chat history, sessions, SSE)
│   │   └── api-upload.ts       # Upload + SSE progress consumer
│   ├── pages/
│   │   ├── DocumentEditor.tsx  # ByteMD editor + chat panel
│   │   ├── Documents.tsx       # Document list view
│   │   └── Settings.tsx        # LLM config + general settings
│   └── styles/
│       └── bytemd-theme.css    # ByteMD dark theme
├── tests/                    # Python test suite
│   ├── test_converter_fallback.py
│   ├── test_docling_converter.py
│   ├── test_picture_serializer.py
│   └── test_vault_assets.py
├── reference-code/           # Reference implementations
│   └── PageIndex/             # VectifyAI/PageIndex (tree RAG reference)
└── src-tauri/                # Tauri Rust shell
```

## License

MIT
