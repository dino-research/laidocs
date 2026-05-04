import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSidecar } from "../hooks/useSidecar";
import { apiGet, apiPut, apiDelete } from "../lib/sidecar";
import MarkdownPreview from "../components/MarkdownPreview";

type ViewMode = "edit" | "preview" | "split";
type SaveStatus = "saved" | "saving" | "unsaved" | "error";

interface Document {
  doc_id: string;
  content: string;
  title: string;
  folder: string;
  filename: string;
  source_type: string;
  original_path: string;
  created_at: string;
  updated_at: string;
}

export default function DocumentEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { status } = useSidecar();

  const [doc, setDoc] = useState<Document | null>(null);
  const [content, setContent] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasUnsavedRef = useRef(false);

  // Fetch document on mount
  useEffect(() => {
    if (status !== "ready" || !id) return;

    let cancelled = false;

    apiGet<Document>(`/api/documents/${id}`)
      .then((data) => {
        if (!cancelled) {
          setDoc(data);
          setContent(data.content);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg =
            err instanceof Error ? err.message : String(err);
          if (msg.includes("404")) {
            setError("Document not found");
          } else {
            setError(msg);
          }
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [status, id]);

  // Save content to backend
  const saveContent = useCallback(
    async (newContent: string) => {
      if (!id) return;
      setSaveStatus("saving");
      try {
        await apiPut(`/api/documents/${id}`, { content: newContent });
        setSaveStatus("saved");
        hasUnsavedRef.current = false;
      } catch {
        setSaveStatus("error");
      }
    },
    [id],
  );

  // Debounced save — fires 1s after last keystroke
  const scheduleSave = useCallback(
    (newContent: string) => {
      if (newContent === doc?.content) return;
      hasUnsavedRef.current = true;
      setSaveStatus("unsaved");

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        saveContent(newContent);
      }, 1000);
    },
    [doc?.content, saveContent],
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Handle content change
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    scheduleSave(val);
  };

  // Handle Tab key for 2-space indent
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue =
        content.substring(0, start) + "  " + content.substring(end);
      setContent(newValue);
      // Restore cursor position after React re-render
      requestAnimationFrame(() => {
        textarea.selectionStart = start + 2;
        textarea.selectionEnd = start + 2;
      });
    }
  };

  // Delete document
  const handleDelete = async () => {
    if (!id) return;
    try {
      await apiDelete(`/api/documents/${id}`);
      navigate("/");
    } catch {
      // keep dialog open
    }
  };

  // ── Loading / not-ready states ──────────────────────────────────

  if (status !== "ready") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-3 text-2xl animate-pulse">⏳</div>
          <p className="text-sm text-gray-400">Connecting to backend…</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        {/* Toolbar skeleton */}
        <div className="flex items-center gap-3 border-b border-gray-800 px-4 py-3">
          <div className="h-5 w-5 animate-pulse rounded bg-gray-700" />
          <div className="h-5 w-48 animate-pulse rounded bg-gray-700" />
          <div className="ml-auto flex gap-2">
            <div className="h-8 w-16 animate-pulse rounded bg-gray-700" />
            <div className="h-8 w-16 animate-pulse rounded bg-gray-700" />
            <div className="h-8 w-20 animate-pulse rounded bg-gray-700" />
          </div>
        </div>
        {/* Editor skeleton */}
        <div className="flex-1 p-6">
          <div className="h-4 w-3/4 animate-pulse rounded bg-gray-700 mb-3" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-gray-700 mb-3" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-gray-700 mb-6" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-gray-700 mb-3" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-gray-700" />
        </div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-gray-800 px-4 py-3">
          <button
            onClick={() => navigate("/")}
            className="text-gray-400 hover:text-gray-100 transition-colors"
          >
            ← Back
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="mb-3 text-4xl">📄</div>
            <p className="text-lg text-gray-300 mb-2">
              {error || "Document not found"}
            </p>
            <button
              onClick={() => navigate("/")}
              className="text-sm text-blue-400 hover:underline"
            >
              Return to documents
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────

  const viewModeButtons: { mode: ViewMode; label: string }[] = [
    { mode: "edit", label: "Edit" },
    { mode: "split", label: "Split" },
    { mode: "preview", label: "Preview" },
  ];

  const saveStatusDisplay: Record<SaveStatus, { text: string; color: string }> = {
    saved: { text: "Saved", color: "text-green-400" },
    saving: { text: "Saving…", color: "text-yellow-400" },
    unsaved: { text: "Unsaved changes", color: "text-orange-400" },
    error: { text: "Save failed", color: "text-red-400" },
  };

  const statusInfo = saveStatusDisplay[saveStatus];

  const sourceBadge =
    doc.source_type === "url" ? (
      <span className="inline-flex items-center gap-1 text-xs bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded-full border border-blue-800">
        🌐 URL
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full border border-gray-700">
        📎 File
      </span>
    );

  return (
    <div className="flex h-full flex-col">
      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-b border-gray-800 px-4 py-2">
        {/* Back button */}
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-gray-400 hover:text-gray-100 transition-colors text-sm shrink-0"
          title="Back to documents"
        >
          <span className="text-lg leading-none">←</span>
        </button>

        {/* Document title */}
        <h1 className="text-sm font-semibold text-gray-100 truncate min-w-0 max-w-xs">
          {doc.title || doc.filename || `Document ${id}`}
        </h1>

        {/* Source type badge */}
        {sourceBadge}

        {/* Spacer */}
        <div className="flex-1" />

        {/* View mode toggle */}
        <div className="flex items-center bg-gray-800 rounded-lg p-0.5">
          {viewModeButtons.map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === mode
                  ? "bg-gray-700 text-gray-100"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Save status */}
        <span className={`text-xs font-medium ${statusInfo.color} shrink-0`}>
          {statusInfo.text}
        </span>

        {/* Delete button */}
        <div className="relative shrink-0">
          {showDeleteConfirm ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">Delete?</span>
              <button
                onClick={handleDelete}
                className="px-2 py-0.5 text-xs bg-red-600 text-white rounded hover:bg-red-500 transition-colors"
              >
                Yes
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1 text-gray-500 hover:text-red-400 transition-colors"
              title="Delete document"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path
                  fillRule="evenodd"
                  d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 01.79.71l.5 7a.75.75 0 11-1.498.107l-.5-7a.75.75 0 01.708-.817zm3.936 0a.75.75 0 00-.708.817l-.5 7a.75.75 0 101.498.107l.5-7a.75.75 0 00-.79-.71z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Editor / Preview area ────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {(viewMode === "edit" || viewMode === "split") && (
          <div
            className={`flex flex-col bg-gray-900 ${
              viewMode === "split" ? "w-1/2 border-r border-gray-800" : "w-full"
            }`}
          >
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              onKeyDown={handleKeyDown}
              className="flex-1 resize-none bg-gray-900 text-gray-100 font-mono text-sm p-6 leading-relaxed focus:outline-none placeholder-gray-600"
              placeholder="Start writing markdown…"
              spellCheck={false}
            />
          </div>
        )}

        {(viewMode === "preview" || viewMode === "split") && (
          <div
            className={`flex flex-col bg-gray-900 ${
              viewMode === "split" ? "w-1/2" : "w-full"
            }`}
          >
            <MarkdownPreview content={content} />
          </div>
        )}
      </div>
    </div>
  );
}
