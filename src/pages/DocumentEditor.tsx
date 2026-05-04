import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSidecar } from "../hooks/useSidecar";
import { apiGet, apiPut, apiDelete } from "../lib/sidecar";
import MarkdownPreview from "../components/MarkdownPreview";
import ChatPanel from "../components/ChatPanel";

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

// ── SVG Icons ─────────────────────────────────────────────────────
const IconBack = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

const IconChat = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);

const IconGlobe = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

const IconFile = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
    <polyline points="13 2 13 9 20 9"/>
  </svg>
);

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size,
      border: `2px solid var(--border)`,
      borderTopColor: "var(--text-muted)",
      borderRadius: "50%",
    }} className="spin" />
  );
}

const saveStatusConfig: Record<SaveStatus, { text: string; color: string }> = {
  saved:   { text: "Saved",           color: "var(--success)" },
  saving:  { text: "Saving…",         color: "var(--text-muted)" },
  unsaved: { text: "Unsaved changes", color: "#c9a06b" },
  error:   { text: "Save failed",     color: "var(--error)" },
};

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
  const [showChat, setShowChat] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (status !== "ready" || !id) return;
    let cancelled = false;
    apiGet<Document>(`/api/documents/${id}`)
      .then((data) => {
        if (!cancelled) { setDoc(data); setContent(data.content); setLoading(false); }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg.includes("404") ? "Document not found" : msg);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [status, id]);

  const saveContent = useCallback(async (newContent: string) => {
    if (!id) return;
    setSaveStatus("saving");
    try {
      await apiPut(`/api/documents/${id}`, { content: newContent });
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }, [id]);

  const scheduleSave = useCallback((newContent: string) => {
    if (newContent === doc?.content) return;
    setSaveStatus("unsaved");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveContent(newContent), 1000);
  }, [doc?.content, saveContent]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    scheduleSave(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = content.substring(0, start) + "  " + content.substring(end);
      setContent(next);
      requestAnimationFrame(() => { ta.selectionStart = start + 2; ta.selectionEnd = start + 2; });
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    try { await apiDelete(`/api/documents/${id}`); navigate("/"); } catch { /* keep open */ }
  };

  // ── Skeleton / states ──────────────────────────────────────────
  const toolbarStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    borderBottom: "1px solid var(--border)",
    padding: "8px 16px",
    background: "var(--surface)",
    flexShrink: 0,
  };

  if (status !== "ready" || loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={toolbarStyle}>
          <div className="shimmer" style={{ width: 20, height: 20, borderRadius: "50%" }} />
          <div className="shimmer" style={{ width: 200, height: 16 }} />
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {[80, 80, 100].map((w, i) => <div key={i} className="shimmer" style={{ width: w, height: 28, borderRadius: "var(--radius-pill)" }} />)}
          </div>
        </div>
        <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 12 }}>
          {[240, 160, 200, 280, 120].map((w, i) => <div key={i} className="shimmer" style={{ width: w, height: 14 }} />)}
        </div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={toolbarStyle}>
          <button onClick={() => navigate("/")} className="btn-icon"><IconBack /></button>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <div>
            <p style={{ fontSize: 16, color: "var(--text-secondary)", marginBottom: 12 }}>{error || "Document not found"}</p>
            <button onClick={() => navigate("/")} style={{ fontSize: 13, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
              Return to documents
            </button>
          </div>
        </div>
      </div>
    );
  }

  const viewModes: { mode: ViewMode; label: string }[] = [
    { mode: "edit", label: "Edit" },
    { mode: "split", label: "Split" },
    { mode: "preview", label: "Preview" },
  ];

  const statusInfo = saveStatusConfig[saveStatus];

  const sourceBadge = (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, letterSpacing: "1px", textTransform: "uppercase",
      color: "var(--text-muted)", background: "var(--surface-alt)",
      border: "1px solid var(--border)", borderRadius: 4, padding: "2px 8px",
    }}>
      {doc.source_type === "url" ? <IconGlobe /> : <IconFile />}
      {doc.source_type === "url" ? "URL" : "File"}
    </span>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Toolbar */}
      <div style={toolbarStyle}>
        <button onClick={() => navigate("/")} className="btn-icon" title="Back to documents">
          <IconBack />
        </button>

        <h1 style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>
          {doc.title || doc.filename || `Document ${id}`}
        </h1>

        {sourceBadge}

        <div style={{ flex: 1 }} />

        {/* View mode toggle */}
        <div style={{ display: "flex", alignItems: "center", background: "var(--surface-alt)", borderRadius: 8, padding: 3 }}>
          {viewModes.map(({ mode, label }) => (
            <button key={mode} onClick={() => setViewMode(mode)} style={{
              padding: "4px 12px", fontSize: 12, fontWeight: 400,
              borderRadius: 6, border: "none", cursor: "pointer",
              background: viewMode === mode ? "var(--btn-bg)" : "transparent",
              color: viewMode === mode ? "var(--text-primary)" : "var(--text-muted)",
              transition: "all 0.15s",
            }}>{label}</button>
          ))}
        </div>

        <span style={{ fontSize: 11, color: statusInfo.color, letterSpacing: "0.5px", flexShrink: 0 }}>
          {statusInfo.text}
        </span>

        {/* Chat button */}
        <button
          id="chat-with-doc-btn"
          onClick={() => setShowChat((v) => !v)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 14px", fontSize: 12, fontWeight: 400,
            borderRadius: "var(--radius-pill)", border: "1px solid",
            cursor: "pointer", transition: "all 0.15s",
            background: showChat ? "var(--surface-alt)" : "transparent",
            color: showChat ? "var(--text-primary)" : "var(--text-muted)",
            borderColor: showChat ? "var(--border-strong)" : "var(--border)",
          }}
          title="Chat with this document"
        >
          <IconChat /> Chat
        </button>

        {/* Delete */}
        {showDeleteConfirm ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Delete?</span>
            <button onClick={handleDelete} style={{ fontSize: 11, padding: "4px 10px", borderRadius: "var(--radius-pill)", background: "var(--error)", color: "var(--text-primary)", border: "none", cursor: "pointer" }}>Yes</button>
            <button onClick={() => setShowDeleteConfirm(false)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: "var(--radius-pill)", background: "var(--surface-alt)", color: "var(--text-muted)", border: "1px solid var(--border)", cursor: "pointer" }}>No</button>
          </div>
        ) : (
          <button onClick={() => setShowDeleteConfirm(true)} className="btn-icon" title="Delete document">
            <IconTrash />
          </button>
        )}
      </div>

      {/* Editor / Preview area */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {(viewMode === "edit" || viewMode === "split") && (
            <div style={{
              display: "flex", flexDirection: "column",
              background: "var(--surface)",
              width: viewMode === "split" ? "50%" : "100%",
              borderRight: viewMode === "split" ? "1px solid var(--border)" : "none",
            }}>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={handleContentChange}
                onKeyDown={handleKeyDown}
                style={{
                  flex: 1, resize: "none",
                  background: "var(--surface)",
                  color: "var(--text-secondary)",
                  fontFamily: "'Geist Mono', 'Courier New', monospace",
                  fontSize: 13,
                  lineHeight: 1.7,
                  padding: "28px 32px",
                  border: "none",
                  outline: "none",
                }}
                placeholder="Start writing markdown…"
                spellCheck={false}
              />
            </div>
          )}

          {(viewMode === "preview" || viewMode === "split") && (
            <div style={{
              display: "flex", flexDirection: "column",
              background: "var(--surface)",
              width: viewMode === "split" ? "50%" : "100%",
            }}>
              <MarkdownPreview content={content} />
            </div>
          )}
        </div>

        {showChat && id && (
          <div style={{ width: 380, flexShrink: 0, borderLeft: "1px solid var(--border)", overflow: "hidden" }}>
            <ChatPanel docId={id} onClose={() => setShowChat(false)} />
          </div>
        )}
      </div>
    </div>
  );
}
