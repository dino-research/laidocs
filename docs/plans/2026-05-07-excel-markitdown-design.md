# Excel Converter: MarkItDown Integration

## Problem

Docling's Excel converter duplicates merged cell values across all spanned columns, producing noisy Markdown output. A file with 55+ merged cell ranges generates tables where values like "GET STARTED" repeat 7 times on a single row.

## Decision

Replace Docling with MarkItDown (Microsoft) for `.xlsx` files only. All other formats (PDF, DOCX, PPTX, HTML) continue using Docling.

### Why MarkItDown

- Internally uses `pandas.read_excel()` + `openpyxl` — handles merged cells correctly (shows value once, NaN for spanned cells)
- Produces 1 contiguous table per sheet with `## SheetName` headings
- 121k GitHub stars, MIT license, active development
- LLM integration does NOT affect Excel output (confirmed via source code and testing)

## Design

### Routing Logic in `converter.py`

```python
def convert_file(self, file_path, *, doc_id, assets_dir):
    if Path(file_path).suffix.lower() == '.xlsx':
        return self._convert_excel(file_path)
    else:
        return self._convert_with_docling(file_path, doc_id=doc_id, assets_dir=assets_dir)
```

### Excel Post-Processing

After MarkItDown conversion, apply:
1. Replace `NaN` → empty string
2. Remove `Unnamed: X` header text
3. Collapse 3+ consecutive blank lines → 2
4. Pass through existing `_refine()` LLM step (if configured)

### Dependencies

Add `markitdown[xlsx]` to `requirements.txt`. pandas and openpyxl are transitive dependencies (already present).

## Files Changed

- `backend/services/converter.py` — add Excel routing + MarkItDown converter method + post-process
- `backend/requirements.txt` — add `markitdown[xlsx]`

## Verification

- Convert `tescases/sample-data.xlsx` and confirm no duplicate values
- Convert existing PDF/DOCX/PPTX files and confirm Docling path unchanged
- Run full app upload flow end-to-end
