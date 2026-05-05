# Docling Integration Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Replace `MarkItDown` with `Docling` to extract and save images from uploaded documents, emit them as physical PNG files in the vault's `assets/` folder, and include VLM-generated descriptions in the output Markdown.

**Architecture:** `DocumentConverter` (Docling) replaces the MarkItDown wrapper. A custom `VaultPictureSerializer` saves images to `<vault>/assets/` and emits `![img](/assets/...)` + optional blockquote description. FastAPI mounts `assets/` as static files so ByteMD preview can render them. The configured LLM does double-duty: VLM vision description (PDF) + post-processing text refinement.

**Tech Stack:** `docling`, `docling-core`, `openai` (already present), `fastapi.staticfiles.StaticFiles`, `Pillow` (docling dependency).

---

## Task 1: Install Docling and Remove MarkItDown

**Files:**
- Modify: `backend/requirements.txt` (or `pyproject.toml`)

**Step 1: Add/remove dependencies**

```bash
# In the backend virtual environment
pip uninstall markitdown -y
pip install "docling>=2.0" "docling-core>=2.0"
```

Then update `requirements.txt` (remove `markitdown`, add `docling`):
```txt
# remove:
# markitdown[all]
# add:
docling>=2.0
docling-core>=2.0
```

**Step 2: Verify docling imports work**

```bash
python -c "from docling.document_converter import DocumentConverter; print('OK')"
```
Expected: `OK`

**Step 3: Commit**

```bash
git add backend/requirements.txt
git commit -m "chore(deps): replace markitdown with docling"
```

---

## Task 2: Create the Assets Directory in Vault

**Files:**
- Modify: `backend/core/vault.py` (lines 15–19, and `_ensure_vault`)
- Modify: `backend/main.py` (lifespan startup)

**Step 1: Write the failing test**

```python
# tests/test_vault_assets.py
from pathlib import Path
from backend.core.vault import VAULT_DIR, ensure_assets_dir

def test_ensure_assets_dir_creates_folder(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.core.vault.VAULT_DIR", tmp_path / "vault")
    ensure_assets_dir()
    assert (tmp_path / "vault" / "assets").is_dir()
```

**Step 2: Run to verify it fails**

```bash
pytest tests/test_vault_assets.py -v
```
Expected: `FAILED` — `ImportError: cannot import name 'ensure_assets_dir'`

**Step 3: Implement**

Add to `backend/core/vault.py` after line 19:

```python
ASSETS_DIR = VAULT_DIR / "assets"

def ensure_assets_dir() -> Path:
    """Create and return the vault's assets directory."""
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    return ASSETS_DIR
```

Also update `_ensure_vault` to also create assets:
```python
def _ensure_vault() -> None:
    VAULT_DIR.mkdir(parents=True, exist_ok=True)
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
```

**Step 4: Run to verify it passes**

```bash
pytest tests/test_vault_assets.py -v
```
Expected: `PASSED`

**Step 5: Mount assets in FastAPI**

In `backend/main.py`, add after the router registrations (around line 138):

```python
from fastapi.staticfiles import StaticFiles
from backend.core.vault import ensure_assets_dir

# Mount vault assets as static files (for image serving in ByteMD preview)
assets_path = ensure_assets_dir()
app.mount("/assets", StaticFiles(directory=str(assets_path)), name="assets")
```

**Step 6: Commit**

```bash
git add backend/core/vault.py backend/main.py tests/test_vault_assets.py
git commit -m "feat(vault): add assets directory + StaticFiles mount at /assets"
```

---

## Task 3: Implement `VaultPictureSerializer`

**Files:**
- Create: `backend/services/picture_serializer.py`
- Create: `tests/test_picture_serializer.py`

**Step 1: Write the failing test**

```python
# tests/test_picture_serializer.py
from pathlib import Path
from unittest.mock import MagicMock, patch
from backend.services.picture_serializer import VaultPictureSerializer


def test_serializer_saves_image_and_emits_markdown(tmp_path):
    """When get_image returns a PIL image, save PNG and emit markdown ref."""
    serializer = VaultPictureSerializer(assets_dir=tmp_path, doc_id="doc1")

    # Mock PictureItem with no description
    item = MagicMock()
    item.meta = None

    # Mock PIL image returned by get_image
    mock_img = MagicMock()
    item.get_image.return_value = mock_img

    doc = MagicMock()
    doc_serializer = MagicMock()

    result = serializer.serialize(item=item, doc_serializer=doc_serializer, doc=doc)

    # Image should be saved
    mock_img.save.assert_called_once_with(tmp_path / "doc1_0.png")
    # Markdown should contain image reference
    assert "![Image 1](/assets/doc1_0.png)" in result.text
    # No description blockquote
    assert "> **Description:**" not in result.text


def test_serializer_appends_description_when_present(tmp_path):
    """When item.meta.description is set, append blockquote description."""
    serializer = VaultPictureSerializer(assets_dir=tmp_path, doc_id="doc1")

    item = MagicMock()
    item.meta.description.text = "A bar chart showing revenue."
    item.get_image.return_value = MagicMock()

    result = serializer.serialize(
        item=item, doc_serializer=MagicMock(), doc=MagicMock()
    )

    assert "> **Description:** A bar chart showing revenue." in result.text


def test_serializer_handles_no_image(tmp_path):
    """When get_image returns None, emit placeholder, save nothing."""
    serializer = VaultPictureSerializer(assets_dir=tmp_path, doc_id="doc1")

    item = MagicMock()
    item.meta = None
    item.get_image.return_value = None

    result = serializer.serialize(
        item=item, doc_serializer=MagicMock(), doc=MagicMock()
    )

    assert "<!-- image not available -->" in result.text
    assert list(tmp_path.iterdir()) == []  # nothing saved
```

**Step 2: Run to verify it fails**

```bash
pytest tests/test_picture_serializer.py -v
```
Expected: `FAILED` — `ModuleNotFoundError`

**Step 3: Implement**

Create `backend/services/picture_serializer.py`:

```python
"""Custom Docling picture serializer — saves images to vault and emits Markdown refs."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

from docling_core.transforms.serializer.base import BaseDocSerializer, SerializationResult
from docling_core.transforms.serializer.common import create_ser_result
from docling_core.transforms.serializer.markdown import MarkdownPictureSerializer
from docling_core.types.doc.document import DoclingDocument, PictureItem
from typing_extensions import override


class VaultPictureSerializer(MarkdownPictureSerializer):
    """Save each picture to disk and emit ![img](/assets/...) + optional description."""

    def __init__(self, assets_dir: Path, doc_id: str) -> None:
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

        img = item.get_image(doc)
        if img is not None:
            filename = f"{self.doc_id}_{self._counter}.png"
            self._counter += 1
            img.save(self.assets_dir / filename)
            parts.append(f"![Image {self._counter}](/assets/{filename})")
        else:
            parts.append("<!-- image not available -->")

        # Description only available for PDF + VLM path
        if item.meta is not None and item.meta.description is not None:
            desc = item.meta.description.text
            if desc:
                parts.append(f"\n> **Description:** {desc}")

        return create_ser_result(
            text="\n".join(parts),
            span_source=item,
        )
```

**Step 4: Run to verify it passes**

```bash
pytest tests/test_picture_serializer.py -v
```
Expected: all 3 tests `PASSED`

**Step 5: Commit**

```bash
git add backend/services/picture_serializer.py tests/test_picture_serializer.py
git commit -m "feat(converter): add VaultPictureSerializer — save images + emit markdown refs"
```

---

## Task 4: Implement `DoclingConverter` service

**Files:**
- Modify: `backend/services/converter.py` (full rewrite)
- Create: `tests/test_docling_converter.py`

**Step 1: Write the failing test**

```python
# tests/test_docling_converter.py
from unittest.mock import patch, MagicMock
from pathlib import Path
from backend.services.converter import DoclingConverter


def test_convert_returns_markdown_and_title(tmp_path):
    """convert_file returns (markdown_str, title_str) for a valid file."""
    converter = DoclingConverter()

    mock_doc = MagicMock()
    mock_doc.name.text_content = "# My Doc\n\nHello world."

    with patch.object(converter._converter, "convert") as mock_convert:
        mock_result = MagicMock()
        mock_result.document = mock_doc
        mock_convert.return_value = mock_result

        with patch("backend.services.converter.MarkdownDocSerializer") as mock_ser:
            mock_ser.return_value.serialize.return_value.text = "# My Doc\n\nHello world."
            md, title = converter.convert_file(
                str(tmp_path / "test.pdf"),
                doc_id="abc123",
                assets_dir=tmp_path / "assets",
            )

    assert "# My Doc" in md
    assert title == "My Doc"


def test_extract_title_falls_back_to_filename(tmp_path):
    """When no H1 in markdown, use the filename stem as title."""
    from backend.services.converter import _extract_title
    title = _extract_title("Some plain text without headings.", "/path/to/my_file.pdf")
    assert title == "my_file"
```

**Step 2: Run to verify it fails**

```bash
pytest tests/test_docling_converter.py -v
```
Expected: `FAILED` — `ImportError: cannot import name 'DoclingConverter'`

**Step 3: Implement — full rewrite of `converter.py`**

```python
"""Document conversion service — Docling with VaultPictureSerializer."""

from __future__ import annotations

import re
from pathlib import Path

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import (
    PdfPipelineOptions,
    PictureDescriptionApiOptions,
)
from docling.document_converter import (
    DocumentConverter as _DoclingConverter,
    PdfFormatOption,
    WordFormatOption,
    PowerpointFormatOption,
    ExcelFormatOption,
    HTMLFormatOption,
)
from docling_core.transforms.serializer.markdown import (
    MarkdownDocSerializer,
    MarkdownParams,
)
from docling_core.types.doc.document import ImageRefMode

from .picture_serializer import VaultPictureSerializer


def _extract_title(markdown: str, file_path: str) -> str:
    """Extract title from first H1 heading, fallback to filename stem."""
    match = re.search(r"^#\s+(.+)$", markdown, re.MULTILINE)
    if match:
        return match.group(1).strip()
    return Path(file_path).stem


def _build_docling_converter(settings) -> _DoclingConverter:
    """Build a DocumentConverter configured from app settings."""
    llm_configured = bool(settings.llm.base_url and settings.llm.model)

    pdf_options = PdfPipelineOptions(
        generate_picture_images=True,
        images_scale=2.0,
        do_picture_description=llm_configured,
        enable_remote_services=llm_configured,
    )

    if llm_configured:
        base = settings.llm.base_url.rstrip("/")
        # Append OpenAI-compatible endpoint
        url = base + "/chat/completions"
        pdf_options.picture_description_options = PictureDescriptionApiOptions(
            url=url,
            params=dict(
                model=settings.llm.model,
                max_completion_tokens=200,
            ),
            prompt="Describe this image in 2-3 concise sentences. Be precise.",
            timeout=60,
        )

    return _DoclingConverter(
        format_options={
            InputFormat.PDF:  PdfFormatOption(pipeline_options=pdf_options),
            InputFormat.DOCX: WordFormatOption(),
            InputFormat.PPTX: PowerpointFormatOption(),
            InputFormat.XLSX: ExcelFormatOption(),
            InputFormat.HTML: HTMLFormatOption(),
        }
    )


class DoclingConverter:
    """Convert uploaded documents to Markdown using Docling."""

    def __init__(self) -> None:
        from ..core.config import get_settings
        self._settings = get_settings()
        self._converter = _build_docling_converter(self._settings)

    def convert_file(
        self,
        file_path: str,
        *,
        doc_id: str,
        assets_dir: Path,
    ) -> tuple[str, str]:
        """Convert a file to Markdown, saving any images to assets_dir.

        Returns:
            (markdown_content, title)
        """
        assets_dir.mkdir(parents=True, exist_ok=True)

        result = self._converter.convert(file_path)
        doc = result.document

        serializer = MarkdownDocSerializer(
            doc=doc,
            picture_serializer=VaultPictureSerializer(
                assets_dir=assets_dir,
                doc_id=doc_id,
            ),
            params=MarkdownParams(image_mode=ImageRefMode.PLACEHOLDER),
        )
        markdown = serializer.serialize().text
        markdown = self._refine(markdown)
        title = _extract_title(markdown, file_path)
        return markdown, title

    # ── optional LLM post-processing ─────────────────────────────────

    def _refine(self, raw_md: str) -> str:
        """Send markdown to LLM for OCR noise removal. Returns raw if LLM unavailable."""
        s = self._settings
        if not (s.llm.base_url and s.llm.model):
            return raw_md
        try:
            from openai import OpenAI
            client = OpenAI(
                base_url=s.llm.base_url,
                api_key=s.llm.api_key or "none",
            )
            resp = client.chat.completions.create(
                model=s.llm.model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a Markdown cleanup assistant. "
                            "Remove OCR noise and garbage characters. "
                            "Strictly preserve all headings, structure, tables, "
                            "and ![image] tags exactly as-is. "
                            "Return only the cleaned Markdown, no commentary."
                        ),
                    },
                    {"role": "user", "content": raw_md},
                ],
                temperature=0,
            )
            return resp.choices[0].message.content or raw_md
        except Exception as exc:
            print(f"[converter] LLM refinement failed (using raw): {exc}")
            return raw_md


# Alias for backwards compatibility with any existing import
DocumentConverter = DoclingConverter
```

**Step 4: Run to verify it passes**

```bash
pytest tests/test_docling_converter.py -v
```
Expected: all tests `PASSED`

**Step 5: Commit**

```bash
git add backend/services/converter.py tests/test_docling_converter.py
git commit -m "feat(converter): replace MarkItDown with Docling pipeline + VaultPictureSerializer"
```

---

## Task 5: Update the Upload API endpoint

**Files:**
- Modify: `backend/api/documents.py`

**Step 1: Find the upload handler**

The upload endpoint calls `DocumentConverter().convert_file(file_path)`. It needs to also pass `doc_id` and `assets_dir`.

Locate in `backend/api/documents.py` the line:
```python
converter = DocumentConverter()
markdown, title = converter.convert_file(file_path)
```

**Step 2: Update to pass required kwargs**

```python
from backend.core.vault import ASSETS_DIR

converter = DoclingConverter()          # use new name explicitly
doc_id = str(uuid.uuid4())             # generate doc_id before conversion
markdown, title = converter.convert_file(
    file_path,
    doc_id=doc_id,
    assets_dir=ASSETS_DIR,
)
```

Make sure `doc_id` is then passed through to `vault.save_document(..., doc_id=doc_id)` so the IDs match.

**Step 3: Update the import at the top of `documents.py`**

```python
# Remove:
from backend.services.converter import DocumentConverter
# Add:
from backend.services.converter import DoclingConverter
```

**Step 4: Manual smoke test**

```bash
# Start the backend
python -m backend.main --dev

# Upload a PDF
curl -X POST http://localhost:8008/api/documents/upload \
  -F "file=@/path/to/test.pdf" \
  -F "folder=testfolder"
```

Expected:
- `200 OK` with `{"doc_id": "...", "title": "..."}`
- PNG files appear in `~/.laidocs/vault/assets/`
- GET `http://localhost:8008/assets/<filename>.png` returns 200

**Step 5: Commit**

```bash
git add backend/api/documents.py
git commit -m "feat(api): wire DoclingConverter into upload endpoint with doc_id + assets_dir"
```

---

## Task 6: Verify image rendering in ByteMD preview

**Step 1: Open the app and upload a PDF with images**

```bash
pnpm tauri dev
```

Upload a PDF containing at least one embedded image via the UI.

**Step 2: Open the document in the editor**

Check that:
- The Markdown content contains `![Image N](/assets/<doc_id>_N.png)` entries
- (For PDF with LLM configured) A `> **Description:**` blockquote appears below each image

**Step 3: Switch to Preview mode**

In ByteMD preview, the images should render (not show broken links). The browser loads them from `http://localhost:8008/assets/...`.

**Step 4: Verify for DOCX/PPTX**

Upload a Word document with images. Verify:
- Images are saved to `assets/`
- Markdown has `![Image N]` references
- No description blockquote (expected — DOCX has no VLM)

**Step 5: Commit nothing** (this is a verification step only)

---

## Task 7: Fallback — LLM unavailable or vision-unsupported

**Step 1: Write the test**

```python
# tests/test_converter_fallback.py
from unittest.mock import patch
from backend.services.converter import DoclingConverter


def test_refine_returns_raw_when_llm_not_configured():
    converter = DoclingConverter.__new__(DoclingConverter)
    converter._settings = type("S", (), {
        "llm": type("L", (), {"base_url": "", "model": "", "api_key": ""})()
    })()
    result = converter._refine("# Raw Markdown\n\nGarbage: @@@@")
    assert result == "# Raw Markdown\n\nGarbage: @@@@"


def test_refine_returns_raw_on_exception():
    converter = DoclingConverter.__new__(DoclingConverter)
    converter._settings = type("S", (), {
        "llm": type("L", (), {
            "base_url": "http://fake",
            "model": "gpt-4",
            "api_key": "key"
        })()
    })()
    with patch("backend.services.converter.OpenAI") as mock_openai:
        mock_openai.return_value.chat.completions.create.side_effect = Exception("timeout")
        result = converter._refine("# Raw")
    assert result == "# Raw"
```

**Step 2: Run test**

```bash
pytest tests/test_converter_fallback.py -v
```
Expected: `PASSED` (logic is already in Task 4's implementation)

**Step 3: Commit**

```bash
git add tests/test_converter_fallback.py
git commit -m "test(converter): add fallback tests — no LLM, LLM exception"
```

---

## Task 8: Run full test suite and final check

**Step 1: Run all tests**

```bash
pytest tests/ -v
```
Expected: all pass, no regressions.

**Step 2: Final integration smoke test**

1. Start app: `pnpm tauri dev`
2. Go to Settings → configure LLM with a vision-capable model (e.g. `gpt-4o`)
3. Upload a multi-page PDF with charts/diagrams
4. Open the created document
5. Verify: Markdown has `![Image N]` + `> **Description:**` blocks
6. Switch to Preview mode → images render correctly
7. Upload a `.docx` with images → images in `assets/`, no description
8. Upload a `.xlsx` → text/table only, no image references

**Step 3: Final commit**

```bash
git add .
git commit -m "feat(docling): complete Docling integration — multi-format, image extraction, VLM description"
git push
```
