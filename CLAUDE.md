# LAIDocs

Local AI-powered document manager: convert files/URLs to Markdown, organize in folders, semantic search, and RAG Q&A. Fully local — only connects to your configured LLM API.

## Commands

```bash
# Frontend (React + Vite)
pnpm install
pnpm dev          # Vite dev server on :5173

# Backend (Python FastAPI sidecar)
python3 backend/main.py --dev   # starts on localhost:8008

# Full Tauri app (frontend + sidecar)
pnpm tauri dev

# Build
pnpm build                       # TypeScript + Vite build
pnpm tauri build                 # full production build
python3 build_sidecar.py         # PyInstaller sidecar binary

# Backend venv (if needed)
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
```

## Architecture

```
Tauri v2 (Rust shell)
├── React 19 + TypeScript + Tailwind (WebView, port 5173)
├── Python FastAPI sidecar (localhost:8008)
│   ├── Docling — document → Markdown conversion
│   ├── Crawl4AI — web crawling
│   ├── LanceDB — vector search (embeddings)
│   ├── SQLite FTS5 — full-text search (BM25)
│   └── RAG pipeline — chat with documents
└── Vault — filesystem storage at ~/.laidocs/vault/
```

Frontend communicates with the sidecar via HTTP REST + SSE on `localhost:8008`. The Tauri shell plugin spawns the sidecar process.

## Key Paths

| Path | Purpose |
|------|---------|
| `~/.laidocs/config.json` | Persisted settings (LLM, embedding, reranker config) |
| `~/.laidocs/vault/<folder>/<doc>.md` | Converted Markdown documents |
| `~/.laidocs/vault/<folder>/<doc>.md.meta.json` | Document metadata sidecar |
| `~/.laidocs/vault/assets/<doc_id>_N.png` | Extracted images |
| `~/.laidocs/data/vectors.lance/` | LanceDB vector store |
| `~/.laidocs/data/laidocs.db` | SQLite database |

## Project Structure

```
src/                    # React frontend
├── pages/              # Documents, DocumentEditor, Search, Settings
├── components/         # Sidebar, ChatPanel, UploadDialog, MarkdownPreview, etc.
├── context/            # FolderContext, UploadContext (React state)
├── hooks/              # useSidecar (Tauri invoke wrappers)
└── lib/                # sidecar.ts (HTTP helpers, SSE, health polling)
backend/                # Python FastAPI sidecar
├── api/                # REST routers: documents, folders, search, chat, settings
├── core/               # config, database (SQLite + LanceDB), exceptions, vault
├── models/             # Pydantic document model
└── services/           # converter, crawler, indexer, rag, search
src-tauri/              # Tauri v2 (Rust)
└── src/main.rs         # Sidecar spawn/shutdown, Tauri commands
```

## Sidecar Lifecycle

- **Spawn**: Tauri auto-starts the sidecar on app launch via `spawn_sidecar()`. Dev mode runs `python3 backend/main.py --dev`; release mode uses the bundled PyInstaller binary from `src-tauri/bin/api/main`.
- **Shutdown**: ALWAYS via stdin — sends `"sidecar shutdown\n"`. Never call `process.kill()`. The Python backend's stdin listener handles graceful exit.
- **Health check**: Frontend polls `GET /api/health` until 200. In Tauri mode, also listens for `sidecar-stdout` events containing `"ready"`.

## Frontend ↔ Backend Protocol

- REST API at `http://localhost:8008` — see `src/lib/sidecar.ts` for `apiGet`/`apiPost`/`apiPut`/`apiDelete` helpers.
- SSE streaming for chat (`POST /api/chat/stream`) and upload progress stages.
- Assets served at `/assets/<filename>` via FastAPI `StaticFiles` mount.

## Gotchas

- **LanceDB schema migration**: On startup, the backend checks if the vector column uses `FixedSizeList`. If not, it auto-migrates and re-indexes all documents in a background thread.
- **UTF-8 on Windows**: `main.py` forces `PYTHONUTF8=1` and reconfigures stdout/stderr to UTF-8 — needed for CJK content.
- **Dev mode Python**: If `backend/.venv/bin/python3` exists, Tauri uses it; otherwise falls back to system `python3`.
- **Design system**: Warp-inspired warm dark theme — see `DESIGN.md` for colors, typography, and component patterns.
- **Tauri dev CWD**: During `tauri dev`, Tauri sets CWD to the project root (where `package.json` lives). The Rust code resolves paths relative to this.
