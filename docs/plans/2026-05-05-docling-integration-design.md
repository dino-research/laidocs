# Docling Integration Design for laidocs

_Last updated: 2026-05-05_

## Context

The current application uses `MarkItDown` for document-to-Markdown conversion. `MarkItDown` lacks native image extraction and physical file saving. We replace it with **Docling** — a powerful document understanding library with layout extraction, image cropping, and VLM integration.

**Goals:**
1. Extract images from uploaded documents and save them as physical PNG files inside the user's vault.
2. Emit each image in Markdown followed by a blockquote description (when VLM is available).
3. Use the configured LLM (OpenAI-compatible) for both vision description and post-processing text refinement.
4. Support PDF, DOCX, PPTX, XLSX, and HTML with per-format behaviour.

---

## Vault-Centric Local-First Data Model

User selects a **vault folder** — all data lives there. This enables backup, migration, and privacy without a server.

```
<user-selected-vault>/
├── assets/                   ← extracted images (PNG)
│   ├── <doc_id>_0.png
│   └── <doc_id>_1.png
├── laidocs.db                ← SQLite + FTS5
└── lancedb/                  ← vector embeddings
```

FastAPI mounts the assets directory as static files:
```python
app.mount("/assets", StaticFiles(directory=f"{vault_path}/assets"), name="assets")
```

Image URLs in Markdown are relative to the backend: `http://localhost:PORT/assets/<filename>`.

---

## Per-Format Pipeline Behaviour

| Format | Image Extraction | VLM Description | Notes |
|--------|-----------------|-----------------|-------|
| PDF    | ✅ via `PdfPipelineOptions` | ✅ via `PictureDescriptionApiOptions` | Full pipeline |
| DOCX   | ✅ save PNG, no description | ❌ | `WordFormatOption` |
| PPTX   | ✅ save PNG, no description | ❌ | `PowerpointFormatOption` |
| XLSX   | ❌ text/table only | ❌ | `ExcelFormatOption` |
| HTML   | ❌ text only | ❌ | `HTMLFormatOption` |

---

## Architecture & Components

### 1. DocumentConverter Configuration

```python
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import (
    PdfPipelineOptions,
    PictureDescriptionApiOptions,
)
from docling.document_converter import (
    DocumentConverter, PdfFormatOption,
    WordFormatOption, PowerpointFormatOption,
    ExcelFormatOption, HTMLFormatOption,
)

def build_converter(settings) -> DocumentConverter:
    pdf_options = PdfPipelineOptions(
        generate_picture_images=True,
        images_scale=2.0,
        do_picture_description=bool(settings.llm.base_url),
        enable_remote_services=bool(settings.llm.base_url),
    )

    if settings.llm.base_url:
        # Append OpenAI-compatible chat completions endpoint
        url = settings.llm.base_url.rstrip("/") + "/chat/completions"
        pdf_options.picture_description_options = PictureDescriptionApiOptions(
            url=url,
            params=dict(model=settings.llm.model, max_completion_tokens=200),
            prompt="Describe this image in 2-3 concise sentences.",
            timeout=60,
        )

    return DocumentConverter(
        format_options={
            InputFormat.PDF:        PdfFormatOption(pipeline_options=pdf_options),
            InputFormat.DOCX:       WordFormatOption(),
            InputFormat.PPTX:       PowerpointFormatOption(),
            InputFormat.XLSX:       ExcelFormatOption(),
            InputFormat.HTML:       HTMLFormatOption(),
        }
    )
```

**Note:** `enable_remote_services=True` is required by Docling before any remote VLM call is made.

---

### 2. Custom Markdown Serializer

Extends `MarkdownPictureSerializer` from `docling_core`. On each picture item:
- Saves the PIL image to `<vault>/assets/<doc_id>_<idx>.png`
- Returns Markdown with image reference + blockquote description (if available)

```python
from pathlib import Path
from typing import Any, Optional

from docling_core.transforms.serializer.base import BaseDocSerializer, SerializationResult
from docling_core.transforms.serializer.common import create_ser_result
from docling_core.transforms.serializer.markdown import MarkdownPictureSerializer
from docling_core.types.doc.document import DoclingDocument, PictureItem
from typing_extensions import override


class VaultPictureSerializer(MarkdownPictureSerializer):
    def __init__(self, assets_dir: Path, doc_id: str):
        self.assets_dir = assets_dir
        self.doc_id = doc_id
        self._counter = 0

    @override
    def serialize(
        self,
        *,
        item: PictureItem,
        doc_serializer: BaseDocSerializer,
        doc: DoclingDocument,
        separator: Optional[str] = None,
        **kwargs: Any,
    ) -> SerializationResult:
        parts: list[str] = []

        # Save image to disk
        img = item.get_image(doc)
        if img is not None:
            filename = f"{self.doc_id}_{self._counter}.png"
            self._counter += 1
            img.save(self.assets_dir / filename)
            parts.append(f"![Image {self._counter}](/assets/{filename})")
        else:
            parts.append("<!-- image not available -->")

        # Append description (only available for PDF + VLM path)
        if item.meta and item.meta.description:
            parts.append(f"\n> **Description:** {item.meta.description.text}")

        text = "\n".join(parts)
        return create_ser_result(text=text, span_source=item)
```

**Serialize call:**
```python
from docling_core.transforms.serializer.markdown import MarkdownDocSerializer, MarkdownParams
from docling_core.types.doc.document import ImageRefMode

serializer = MarkdownDocSerializer(
    doc=doc,
    picture_serializer=VaultPictureSerializer(assets_dir, doc_id),
    params=MarkdownParams(image_mode=ImageRefMode.PLACEHOLDER),
)
markdown = serializer.serialize().text
```

---

### 3. LLM Post-Processing (Text Refinement)

After serialization, if LLM is configured, send the full Markdown for cleanup.

```python
async def refine_markdown(raw_md: str, settings) -> str:
    if not settings.llm.base_url:
        return raw_md
    try:
        client = openai.AsyncOpenAI(
            base_url=settings.llm.base_url,
            api_key=settings.llm.api_key or "none",
        )
        resp = await client.chat.completions.create(
            model=settings.llm.model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a Markdown cleanup assistant. "
                        "Remove OCR noise and garbage characters. "
                        "Preserve all headings, structure, tables, and ![image] tags exactly. "
                        "Return only the cleaned Markdown, no commentary."
                    ),
                },
                {"role": "user", "content": raw_md},
            ],
            temperature=0,
        )
        return resp.choices[0].message.content or raw_md
    except Exception:
        return raw_md  # fallback: return unrefined markdown
```

---

## Data Flow

```
POST /api/documents/upload
  │
  ├─ 1. Detect format (PDF / DOCX / PPTX / XLSX / HTML)
  ├─ 2. build_converter(settings) → DocumentConverter
  ├─ 3. converter.convert(file_path).document → DoclingDocument
  ├─ 4. VaultPictureSerializer saves PNGs to <vault>/assets/
  ├─ 5. MarkdownDocSerializer serializes full Markdown
  ├─ 6. refine_markdown(raw_md, settings)  ← optional LLM cleanup
  ├─ 7. Save cleaned Markdown to SQLite + FTS5
  └─ 8. Embed Markdown chunks → LanceDB
```

---

## Fallback & Error Handling

| Scenario | Behaviour |
|----------|-----------|
| LLM not configured | Skip VLM description + skip post-processing refinement |
| VLM API fails / vision not supported | Docling falls back to EasyOCR alt-text; `item.meta.description` will be empty or contain OCR text |
| Image extraction fails for a picture | Emit `<!-- image not available -->` placeholder |
| Refinement LLM call fails | Return raw (un-refined) Markdown |
| DOCX/PPTX has no images | No assets created; Markdown is text/table only |

---

## Static File Serving

FastAPI backend mounts the vault's assets folder. The mount is set up at startup after the vault path is resolved from settings:

```python
# In FastAPI lifespan or startup event
vault_path = Path(settings.vault_path)
(vault_path / "assets").mkdir(parents=True, exist_ok=True)
app.mount("/assets", StaticFiles(directory=str(vault_path / "assets")), name="assets")
```

Image URLs embedded in Markdown (`/assets/abc123_0.png`) resolve against the backend base URL (`http://localhost:PORT`). The ByteMD preview and future export features use this URL as-is.

---

## Markdown Output Examples

**PDF with VLM description:**
```markdown
## Revenue Analysis

![Image 1](/assets/abc123_0.png)

> **Description:** A bar chart comparing Q1–Q4 revenue across 2022–2024, showing 34% YoY growth in the enterprise segment.

The following table summarizes the quarterly breakdown...
```

**DOCX/PPTX (no VLM):**
```markdown
## Product Roadmap

![Image 1](/assets/abc123_1.png)

The diagram above illustrates the three-phase delivery plan...
```

**XLSX / HTML (text only):**
```markdown
## Q1 Sales Data

| Product | Units | Revenue |
|---------|-------|---------|
| Alpha   | 1,200 | $48,000 |
```
