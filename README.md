# LAIDocs — Local AI-powered Document Manager

> Smart document management system running 100% locally. Convert files & URLs to markdown, organize in custom folders, semantic search, and Q&A with your documents.

## Features

- **Document Conversion**: PDF, DOCX, PPTX, XLSX → Markdown (via MarkItDown + LLM-enhanced OCR)
- **Web Crawler**: URL → Markdown (via Crawl4AI + LLM-enhanced extraction)
- **Markdown Editor**: Preview & edit converted markdown
- **Folder Tree**: Custom document organization
- **Hybrid Search**: Semantic (embedding) + Full-text (BM25) search
- **Document Q&A**: Chat with any document using RAG pipeline
- **Fully Local**: Only connects to your configured LLM API

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Desktop Shell | Tauri v2 (Rust) |
| Frontend | React + TypeScript + Tailwind CSS |
| Backend | Python FastAPI (sidecar) |
| Doc Conversion | MarkItDown (Microsoft) |
| Web Crawling | Crawl4AI |
| Vector DB | LanceDB |
| Full-text Search | SQLite FTS5 |
| LLM | OpenAI-compatible API (user-configured) |
| Reranker | Optional (user-configured) |

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Tauri v2 (Rust Shell)                │
│  ┌─────────────────────────────────────────────┐│
│  │           React Frontend (WebView)          ││
│  │  - Document List / Folder Tree              ││
│  │  - Markdown Editor / Preview                ││
│  │  - Search Interface                         ││
│  │  - Q&A Chat Interface                       ││
│  │  - Settings Page                            ││
│  └──────────────────┬──────────────────────────┘│
│                     │ HTTP (localhost:8008)       │
│  ┌──────────────────▼──────────────────────────┐│
│  │         Python FastAPI Backend              ││
│  │  ┌──────────┐ ┌───────────┐ ┌────────────┐ ││
│  │  │MarkItDown│ │ Crawl4AI  │ │ RAG Pipeline│ ││
│  │  │+ LLM OCR │ │+ LLM      │ │            │ ││
│  │  └──────────┘ └───────────┘ └────────────┘ ││
│  │  ┌──────────┐ ┌───────────┐ ┌────────────┐ ││
│  │  │ LanceDB  │ │  FTS5     │ │ Reranker   │ ││
│  │  │(vectors) │ │(SQLite)   │ │(optional)  │ ││
│  │  └──────────┘ └───────────┘ └────────────┘ ││
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

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

On first launch, configure:
1. **LLM Endpoint**: OpenAI-compatible API URL + API Key + Model name
2. **Embedding Model**: Endpoint + model (default: suggested multilingual model)
3. **Reranker** (optional): Endpoint + model

## License

MIT
