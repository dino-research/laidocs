# Upload Progress — Stage-based Tracking Design

**Date:** 2026-05-06  
**Status:** Approved  
**Feature:** Show upload pipeline stages in Sidebar as file is processed

---

## Problem

Converting documents (especially large PDFs via Docling) can take 30–60 seconds. Currently the UI
only shows a generic "Converting…" spinner inside the UploadDialog with no indication of progress.
Users cannot tell if the system is working or stuck.

## Goals

- Show the user which pipeline stage is currently running
- Dialog closes immediately after submit (non-blocking UX)
- Sidebar shows a "pending" item with animated stage label
- When processing completes, the pending item becomes a real clickable document
- No fake percentages — only honest stage labels

## Non-goals

- Exact percentage tracking (Docling is a blackbox)
- Per-file-size time estimation
- Indexing (LanceDB) stage tracking (runs in background, not critical path)

---

## Architecture

```
UploadDialog
  └─ submit (FormData POST)
  └─ close dialog immediately
  └─ call onUploadStart(fileName) → parent lifts pending state

Frontend SSE consumer (fetch + ReadableStream)
  └─ reads stage events from response body
  └─ updates pendingUploads[] state

Sidebar
  └─ renders pendingUploads[] as pending items
  └─ each item shows: filename + animated stage label
  └─ on "saved" event → item removed from pending, document list refreshed
```

---

## Pipeline Stages

| Stage label    | Description                                    | UI display         |
|----------------|------------------------------------------------|--------------------|
| `uploading`    | File bytes in transit to server                | ⟳ uploading...     |
| `uploaded`     | Server received and saved to tempfile          | ✓ uploaded         |
| `converting`   | Docling converting to Markdown (slow step)     | ⟳ converting...    |
| `converted`    | Markdown + images ready                        | ✓ converted        |
| `saving`       | Writing to vault filesystem + SQLite           | ⟳ saving...        |
| `saved`        | Complete — document available, carries metadata | ✓ done            |

---

## Backend Changes

### Endpoint: `POST /api/documents/upload`

Change response from `JSONResponse` → `StreamingResponse` with `media-type: text/event-stream`.

The file upload (multipart/form-data) is unchanged — only the response changes.

```python
async def _upload_generator(file, folder, background_tasks):
    yield sse_event("uploading")
    # write tempfile
    yield sse_event("uploaded")

    yield sse_event("converting")
    markdown, title = get_converter().convert_file(tmp_path, ...)
    yield sse_event("converted")

    yield sse_event("saving")
    meta = vault.save_document(...)
    # sqlite insert
    background_tasks.add_task(indexer.index_document, ...)
    yield sse_event("saved", {"id": meta.doc_id, "title": ..., "folder": ..., "filename": ...})

def sse_event(stage: str, data: dict | None = None) -> str:
    payload = {"stage": stage, **(data or {})}
    return f"data: {json.dumps(payload)}\n\n"
```

---

## Frontend Changes

### 1. `src/lib/api-upload.ts`

Add `apiUploadStream(path, file, folder, onStage)`:
- Uses `fetch` POST with FormData
- Reads `response.body` as `ReadableStream`
- Calls `onStage(stageEvent)` for each SSE event parsed
- Resolves promise when stream ends

### 2. `src/context/UploadContext.tsx` (new)

```typescript
interface PendingUpload {
  id: string          // temporary client-side id
  filename: string    // original filename shown while pending
  stage: string       // current stage label
  docMeta?: DocMeta   // populated when "saved" event arrives
}

interface UploadContextValue {
  pendingUploads: PendingUpload[]
  startUpload: (file: File, folder: string) => void
}
```

Provides global state so `UploadDialog` and `Sidebar` share upload state without prop-drilling.

### 3. `src/components/UploadDialog.tsx`

- On submit: call `context.startUpload(file, folder)` → closes immediately
- Remove `onUploadSuccess` callback (replaced by context)

### 4. `src/components/Sidebar.tsx`

Add pending items section above (or inline with) the document list:

```
📄 Attention.pdf          ← original filename
   ⟳ converting...        ← animated stage label with spinner

📄 My Report.docx
   ✓ uploaded
```

When `saved` event arrives:
- Remove from `pendingUploads`
- Refresh document list → item appears as normal document

---

## Error Handling

| Failure point | Behaviour |
|---------------|-----------|
| Network error during upload | Stage stays at `uploading`, show error label in sidebar |
| Docling conversion fails | SSE emits `{"stage": "error", "message": "..."}`, sidebar shows ✗ error |
| Vault save fails | Same — SSE error event, sidebar error state |
| User navigates away | SSE stream continues in background (fetch not cancelled) |

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `backend/api/documents.py` | Modify `upload_document` to use `StreamingResponse` |
| `src/lib/api-upload.ts` | Add `apiUploadStream()` function |
| `src/context/UploadContext.tsx` | Create new context |
| `src/components/Sidebar.tsx` | Render `pendingUploads`, add pending item UI |
| `src/components/UploadDialog.tsx` | Use context instead of local await |
| `src/App.tsx` | Wrap app in `UploadContextProvider` |
