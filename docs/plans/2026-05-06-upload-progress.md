# Upload Progress — Stage Tracking Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Show upload pipeline stages (uploading → uploaded → converting → converted → saving → saved) as a pending item in the Sidebar while a document is being processed, without blocking the UI.

**Architecture:** The backend upload endpoint is changed to emit Server-Sent Events (SSE) via `StreamingResponse`, yielding a stage event at each pipeline milestone. The frontend reads this stream via `fetch` + `ReadableStream`, maintains a `pendingUploads[]` list in a new `UploadContext`, and the Sidebar renders each pending item with an animated stage label.

**Tech Stack:** FastAPI `StreamingResponse` (SSE), React Context API, TypeScript

---

## Task 1: Backend — SSE helper + streaming upload endpoint

**Files:**
- Modify: `backend/api/documents.py`

**Step 1: Add `_sse()` helper at top of file (after imports)**

Add this function after the existing imports block (around line 25):

```python
import json as _json

def _sse(stage: str, **extra) -> str:
    """Format a single Server-Sent Event line."""
    payload = {"stage": stage, **extra}
    return f"data: {_json.dumps(payload)}\n\n"
```

**Step 2: Replace `upload_document` with streaming version**

Replace the entire `upload_document` function (lines 86–165) with:

```python
@documents_router.post("/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    folder: str = Form(""),
):
    """Upload a file, convert to Markdown, and stream progress via SSE."""
    from fastapi.responses import StreamingResponse

    ext = Path(file.filename).suffix.lower() if file.filename else ""
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    # Read file bytes eagerly (before streaming response starts)
    content = await file.read()
    original_filename = file.filename or "document"

    async def _generate():
        import tempfile, os

        yield _sse("uploading")

        suffix = Path(original_filename).suffix or ".bin"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        yield _sse("uploaded")

        try:
            doc_id = str(uuid.uuid4())

            yield _sse("converting")
            markdown, title = get_converter().convert_file(
                tmp_path,
                doc_id=doc_id,
                assets_dir=ASSETS_DIR,
            )
            yield _sse("converted")

            original_stem = Path(original_filename).stem
            if not title or title.startswith("tmp") or title == Path(tmp_path).stem:
                title = original_stem
            clean_filename = original_stem + ".md" if original_stem else (original_filename or "document.md")

            yield _sse("saving")
            meta = vault.save_document(
                folder=folder or "unsorted",
                filename=clean_filename,
                content=markdown,
                title=title or clean_filename.removesuffix(".md"),
                source_type="file",
                original_path=original_filename,
                doc_id=doc_id,
            )

            with get_db() as conn:
                conn.execute(
                    "INSERT OR IGNORE INTO folders (path, name) VALUES (?, ?)",
                    (meta.folder, meta.folder.split("/")[-1] or meta.folder),
                )
                conn.execute(
                    "INSERT OR REPLACE INTO documents (id, folder, filename, title, source_type, original_path, content) "
                    "VALUES (?,?,?,?,?,?,?)",
                    (meta.doc_id, meta.folder, meta.filename, meta.title,
                     meta.source_type, meta.original_path, markdown),
                )

            background_tasks.add_task(get_indexer().index_document, meta.doc_id, markdown)

            yield _sse("saved",
                       id=meta.doc_id,
                       title=meta.title,
                       folder=meta.folder,
                       filename=meta.filename)
        except Exception as exc:
            yield _sse("error", message=str(exc))
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
```

**Step 3: Manual test**

Start backend (`python backend/main.py --dev`) and test with curl:
```bash
curl -N -X POST http://localhost:8008/api/documents/upload \
  -F "file=@/path/to/test.txt" -F "folder=test"
```
Expected output (streamed):
```
data: {"stage": "uploading"}
data: {"stage": "uploaded"}
data: {"stage": "converting"}
data: {"stage": "converted"}
data: {"stage": "saving"}
data: {"stage": "saved", "id": "...", "title": "...", ...}
```

**Step 4: Commit**
```bash
git add backend/api/documents.py
git commit -m "feat(backend): stream upload progress via SSE stages"
```

---

## Task 2: Frontend — SSE stream consumer in `api-upload.ts`

**Files:**
- Modify: `src/lib/api-upload.ts`

**Step 1: Add `apiUploadStream` function**

Add to `src/lib/api-upload.ts` (keep existing `apiUpload` for compatibility):

```typescript
export interface UploadStageEvent {
  stage: "uploading" | "uploaded" | "converting" | "converted" | "saving" | "saved" | "error";
  id?: string;
  title?: string;
  folder?: string;
  filename?: string;
  message?: string;
}

/**
 * Upload a file and stream back SSE stage events.
 * Calls onStage() for each event. Resolves when stream ends.
 * Rejects on network error or when an "error" stage event is received.
 */
export async function apiUploadStream(
  file: File,
  folder: string,
  onStage: (event: UploadStageEvent) => void,
): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);

  const res = await fetch(`${API_BASE}/api/documents/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upload failed: ${res.status} ${res.statusText}${text ? ` – ${text}` : ""}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        try {
          const event: UploadStageEvent = JSON.parse(trimmed.slice(6));
          onStage(event);
          if (event.stage === "error") {
            throw new Error(event.message || "Upload failed");
          }
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message !== "Unexpected end of JSON input") {
            throw parseErr;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
```

**Step 2: Commit**
```bash
git add src/lib/api-upload.ts
git commit -m "feat(frontend): add apiUploadStream SSE consumer"
```

---

## Task 3: Create `UploadContext`

**Files:**
- Create: `src/context/UploadContext.tsx`

**Step 1: Create the file**

```tsx
import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";
import { apiUploadStream, UploadStageEvent } from "../lib/api-upload";

export interface PendingUpload {
  /** Temporary client-side key (not the doc_id yet) */
  clientId: string;
  /** Original filename shown while pending */
  filename: string;
  /** Current stage label */
  stage: UploadStageEvent["stage"];
  /** Populated once "saved" event arrives */
  docId?: string;
  docTitle?: string;
  docFolder?: string;
  error?: string;
}

interface UploadContextValue {
  pendingUploads: PendingUpload[];
  startUpload: (file: File, folder: string) => void;
}

const UploadContext = createContext<UploadContextValue | null>(null);

export function UploadProvider({ children }: { children: ReactNode }) {
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const counterRef = useRef(0);

  const startUpload = useCallback((file: File, folder: string) => {
    const clientId = `upload-${++counterRef.current}`;

    // Add pending entry immediately
    setPendingUploads((prev) => [
      ...prev,
      { clientId, filename: file.name, stage: "uploading" },
    ]);

    const updateStage = (update: Partial<PendingUpload>) => {
      setPendingUploads((prev) =>
        prev.map((u) => (u.clientId === clientId ? { ...u, ...update } : u))
      );
    };

    apiUploadStream(file, folder, (event) => {
      if (event.stage === "saved") {
        updateStage({
          stage: "saved",
          docId: event.id,
          docTitle: event.title,
          docFolder: event.folder,
        });
        // Remove from pending list after short delay so user sees "saved"
        setTimeout(() => {
          setPendingUploads((prev) => prev.filter((u) => u.clientId !== clientId));
        }, 2000);
      } else if (event.stage === "error") {
        updateStage({ stage: "error", error: event.message });
        // Remove error item after longer delay
        setTimeout(() => {
          setPendingUploads((prev) => prev.filter((u) => u.clientId !== clientId));
        }, 5000);
      } else {
        updateStage({ stage: event.stage });
      }
    }).catch((err) => {
      updateStage({ stage: "error", error: err instanceof Error ? err.message : "Upload failed" });
      setTimeout(() => {
        setPendingUploads((prev) => prev.filter((u) => u.clientId !== clientId));
      }, 5000);
    });
  }, []);

  return (
    <UploadContext.Provider value={{ pendingUploads, startUpload }}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload(): UploadContextValue {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload must be used inside UploadProvider");
  return ctx;
}
```

**Step 2: Wrap App with provider in `src/App.tsx`**

```tsx
// src/App.tsx — add import
import { UploadProvider } from "./context/UploadContext";

// Wrap FolderProvider:
export default function App() {
  return (
    <BrowserRouter>
      <FolderProvider>
        <UploadProvider>          {/* ← add */}
          <Routes>
            ...
          </Routes>
        </UploadProvider>         {/* ← add */}
      </FolderProvider>
    </BrowserRouter>
  );
}
```

**Step 3: Commit**
```bash
git add src/context/UploadContext.tsx src/App.tsx
git commit -m "feat(frontend): add UploadContext for tracking pending uploads"
```

---

## Task 4: Update `UploadDialog` to use context

**Files:**
- Modify: `src/components/UploadDialog.tsx`

**Step 1: Replace `handleUpload` to use context**

Remove `apiUpload` import, add `useUpload`. Change `handleUpload`:

```tsx
// Remove: import { apiUpload } from "../lib/api-upload";
// Add:
import { useUpload } from "../context/UploadContext";

// Inside component:
const { startUpload } = useUpload();

const handleUpload = () => {
  if (!selectedFile) { setError("Please select a file"); return; }
  setError("");
  // Start streaming upload (non-blocking) then close dialog immediately
  startUpload(selectedFile, selectedFolder);
  onClose();
};
```

Remove `uploading` state (no longer needed — spinner lives in Sidebar now).

Update the Upload button (remove `uploading` spinner, simplify):
```tsx
<button onClick={handleUpload} disabled={!selectedFile} className="btn-primary">
  Upload
</button>
```

**Step 2: Commit**
```bash
git add src/components/UploadDialog.tsx
git commit -m "feat(frontend): UploadDialog closes immediately, delegates progress to context"
```

---

## Task 5: Add pending items UI to Sidebar

**Files:**
- Modify: `src/components/Sidebar.tsx`

**Step 1: Import `useUpload` and define stage display config**

At top of `Sidebar.tsx`, add:

```tsx
import { useUpload } from "../context/UploadContext";

const STAGE_LABELS: Record<string, { label: string; done: boolean; isError?: boolean }> = {
  uploading:  { label: "uploading…",  done: false },
  uploaded:   { label: "uploaded",    done: true  },
  converting: { label: "converting…", done: false },
  converted:  { label: "converted",   done: true  },
  saving:     { label: "saving…",     done: false },
  saved:      { label: "saved",       done: true  },
  error:      { label: "failed",      done: true, isError: true },
};
```

**Step 2: Add `PendingUploadItem` component**

Add before `export default function Sidebar()`:

```tsx
function PendingUploadItem({ upload }: { upload: import("../context/UploadContext").PendingUpload }) {
  const info = STAGE_LABELS[upload.stage] ?? { label: upload.stage, done: false };
  return (
    <div style={{
      padding: "6px 12px 6px 14px",
      borderRadius: 7,
      opacity: 0.85,
    }}>
      <div style={{
        fontSize: 13,
        color: "var(--text-secondary)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        marginBottom: 3,
      }}>
        {upload.docTitle || upload.filename}
      </div>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        color: info.isError ? "var(--error)" : info.done ? "var(--success, #6d9b6d)" : "var(--text-faint)",
        letterSpacing: "0.4px",
      }}>
        {!info.done && !info.isError && (
          <span
            className="spin"
            style={{
              display: "inline-block",
              width: 9,
              height: 9,
              border: "1.5px solid var(--border)",
              borderTopColor: "var(--text-muted)",
              borderRadius: "50%",
              flexShrink: 0,
            }}
          />
        )}
        {info.isError && <span style={{ fontSize: 10 }}>✗</span>}
        {info.done && !info.isError && <span style={{ fontSize: 10 }}>✓</span>}
        {upload.error || info.label}
      </div>
    </div>
  );
}
```

**Step 3: Render pending items in Sidebar nav section**

Inside `Sidebar()` component, add after `const navigate = useNavigate();`:

```tsx
const { pendingUploads } = useUpload();
```

Add pending items section inside `<nav>`, right after "All Documents" `NavItem` (around line 248):

```tsx
{/* Pending uploads */}
{pendingUploads.length > 0 && (
  <div style={{ marginTop: 8, marginBottom: 4 }}>
    <div style={{ padding: "0 6px 6px", }}>
      <span className="label-upper">Processing</span>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {pendingUploads.map((upload) => (
        <PendingUploadItem key={upload.clientId} upload={upload} />
      ))}
    </div>
  </div>
)}
```

**Step 4: Trigger document list refresh when upload completes**

The Sidebar doesn't show documents directly (that's in `Documents` page), but we need to refresh the document list. The existing `FolderContext` has `triggerRefreshFolders`. We need a way to signal the Documents page.

Check `src/context/FolderContext.tsx` — if it has a `refreshDocsKey`, use it. If not, add a `triggerRefreshDocs` to `FolderContext`:

```tsx
// In FolderContext.tsx, add:
const [refreshDocsKey, setRefreshDocsKey] = useState(0);
const triggerRefreshDocs = useCallback(() => setRefreshDocsKey((k) => k + 1), []);
// expose in context value and type
```

In `UploadContext.tsx`, when `saved` event arrives, also call `triggerRefreshDocs()` from `FolderContext` (import and use `useFolderContext` inside `UploadProvider`).

**Step 5: Commit**
```bash
git add src/components/Sidebar.tsx src/context/FolderContext.tsx src/context/UploadContext.tsx
git commit -m "feat(frontend): show pending upload stages in Sidebar"
```

---

## Task 6: Verify full flow end-to-end

**Step 1: Start backend**
```bash
cd backend && .venv/bin/python ../backend/main.py --dev
```

**Step 2: Start frontend**
```bash
pnpm dev
```

**Step 3: Test upload flow**

1. Open app → click Upload → select a PDF → click Upload
2. ✅ Dialog closes immediately
3. ✅ Sidebar shows "Processing" section with filename + "uploading…" spinner
4. ✅ Stage updates: uploading → uploaded → converting… → converted → saving… → saved ✓
5. ✅ After 2s, pending item disappears
6. ✅ Document list refreshes with new document

**Step 4: Test error case**

Upload a corrupted file or unsupported extension.
- ✅ Sidebar shows "✗ failed" label
- ✅ Error item disappears after 5s

**Step 5: Final commit**
```bash
git add -A
git commit -m "feat: upload progress stage tracking in Sidebar"
```

---

## CSS Note

Ensure `var(--success)` exists in `src/index.css`. If not, add:
```css
--success: #6d9b6d;
```
Check existing palette in `index.css` before adding.
