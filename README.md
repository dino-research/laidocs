# LAIDocs — Local AI-powered Document Manager

> Smart document management system running 100% locally. Convert files & URLs to Markdown, organize in custom folders, semantic search, and Q&A with your documents.

## Features

- **Document Conversion**: PDF, DOCX, PPTX, XLSX, HTML → Markdown (via Docling + optional VLM-enhanced OCR for images)
- **Image Extraction**: Embedded images are automatically extracted and saved as vault assets, referenced as standard Markdown `![img](/assets/...)` links
- **LLM Refinement**: Optional post-conversion OCR cleanup via your configured LLM (falls back gracefully if not set)
- **Web Crawler**: URL → Markdown (via Crawl4AI + LLM-enhanced extraction)
- **Markdown Editor**: Full-featured split editor/preview powered by ByteMD (GFM, TOC, syntax highlighting)
- **Folder Tree**: Custom document organization
- **Hybrid Search**: Semantic (embedding) + Full-text (BM25) search
- **Document Q&A**: Chat with any document using RAG pipeline
- **Fully Local**: Only connects to your configured LLM API — no data leaves your machine

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Desktop Shell | Tauri v2 (Rust) |
| Frontend | React 19 + TypeScript + Tailwind CSS |
| Backend | Python FastAPI (sidecar) |
| Doc Conversion | Docling ≥ 2.0 (replaces MarkItDown) |
| Markdown Editor | ByteMD + @bytemd/plugin-gfm |
| Web Crawling | Crawl4AI |
| Vector DB | LanceDB |
| Full-text Search | SQLite FTS5 |
| LLM | OpenAI-compatible API (user-configured) |
| Reranker | Optional (user-configured) |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│               Tauri v2 (Rust Shell)                  │
│  ┌───────────────────────────────────────────────┐  │
│  │           React Frontend (WebView)            │  │
│  │  - Document List / Folder Tree               │  │
│  │  - ByteMD Editor / Preview                   │  │
│  │  - Search Interface                          │  │
│  │  - Q&A Chat Interface                        │  │
│  │  - Settings Page                             │  │
│  └──────────────────┬────────────────────────────┘  │
│                     │ HTTP (localhost:8008)           │
│  ┌──────────────────▼────────────────────────────┐  │
│  │          Python FastAPI Backend               │  │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────┐  │  │
│  │  │  Docling │  │ Crawl4AI │  │ RAG Pipeline│  │  │
│  │  │ + VLM OCR│  │ + LLM    │  │            │  │  │
│  │  └──────────┘  └──────────┘  └────────────┘  │  │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────┐  │  │
│  │  │ LanceDB  │  │  FTS5    │  │ Reranker   │  │  │
│  │  │(vectors) │  │(SQLite)  │  │(optional)  │  │  │
│  │  └──────────┘  └──────────┘  └────────────┘  │  │
│  │  ┌────────────────────────────────────────┐  │  │
│  │  │  Vault (filesystem)                    │  │  │
│  │  │  ~/laidocs/vault/                      │  │  │
│  │  │    <folder>/<doc>.md                   │  │  │
│  │  │    <folder>/<doc>.md.meta.json         │  │  │
│  │  │    assets/<doc_id>_N.png               │  │  │
│  │  └────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Document Conversion Pipeline

When a file is uploaded:

1. **Docling** converts PDF/DOCX/PPTX/XLSX/HTML to a structured document model
2. **VaultPictureSerializer** extracts embedded images → saved as `<doc_id>_N.png` in `vault/assets/`
3. **MarkdownDocSerializer** serialises the document to Markdown with `![Image N](/assets/...)` references
4. **LLM refinement** (optional) — sends the raw Markdown to your configured LLM to remove OCR noise while preserving all image tags and structure
5. The resulting `.md` file and a `.meta.json` sidecar are written to `vault/<folder>/`
6. Assets are served at `http://localhost:8008/assets/<filename>` via FastAPI's `StaticFiles` mount

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
   - Used for: web crawl extraction, document Q&A, OCR noise cleanup, PDF image descriptions
2. **Embedding Model**: Endpoint + model (default: suggested multilingual model)
   - Used for: semantic search indexing and RAG retrieval
3. **Reranker** (optional): Endpoint + model
   - Used for: re-ranking search results before RAG context assembly

> All LLM features degrade gracefully — the app works fully offline without any LLM configured. Docling-based conversion, full-text search, and the editor always work.

## Supported File Formats

| Format | Conversion | Image Extraction |
|--------|-----------|-----------------|
| PDF | ✅ Full layout | ✅ (with optional VLM description) |
| DOCX | ✅ | ✅ |
| PPTX | ✅ | ✅ |
| XLSX | ✅ (text/tables) | — |
| HTML | ✅ (text) | — |
| Markdown / TXT / CSV | ✅ (pass-through) | — |
| URL | ✅ (via Crawl4AI) | — |

## Project Structure

```
laidocs/
├── backend/                  # Python FastAPI sidecar
│   ├── api/                  # Route handlers
│   │   ├── documents.py      # Upload, CRUD, crawl, reindex
│   │   ├── folders.py
│   │   ├── search.py
│   │   ├── chat.py
│   │   └── settings.py
│   ├── core/
│   │   ├── config.py         # App settings (pydantic-settings)
│   │   ├── database.py       # SQLite + LanceDB init
│   │   └── vault.py          # Filesystem vault manager + ASSETS_DIR
│   ├── services/
│   │   ├── converter.py      # DoclingConverter (Docling pipeline)
│   │   ├── picture_serializer.py  # VaultPictureSerializer
│   │   ├── crawler.py        # WebCrawler (Crawl4AI)
│   │   └── indexer.py        # LanceDB vector indexer
│   ├── main.py               # FastAPI app + startup lifespan
│   └── requirements.txt
├── src/                      # React + TypeScript frontend
│   ├── components/
│   ├── pages/
│   │   ├── DocumentEditor.tsx  # ByteMD editor + chat panel
│   │   └── ...
│   └── ...
├── tests/                    # Python test suite
│   ├── test_converter_fallback.py
│   ├── test_docling_converter.py
│   ├── test_picture_serializer.py
│   └── test_vault_assets.py
└── src-tauri/                # Tauri Rust shell
```

## Running Tests

```bash
cd /path/to/laidocs
source backend/.venv/bin/activate
pytest tests/ -v
```

## License

MIT
