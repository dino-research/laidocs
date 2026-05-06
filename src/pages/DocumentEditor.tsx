import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSidecar } from "../hooks/useSidecar";
import { apiGet, apiPut, apiDelete, API_BASE } from "../lib/sidecar";
import { Editor } from "@bytemd/react";
import gfm from "@bytemd/plugin-gfm";
import "bytemd/dist/index.css";
import "../styles/bytemd-theme.css";
import ChatPanel from "../components/ChatPanel";

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

// ── Remark plugin: rewrite image URLs for preview ─────────────────
// ByteMD's preview pane resolves image src against the frontend origin.
// This plugin:
//   1. Rewrites /assets/* paths to the FastAPI backend (uploaded files)
//   2. Resolves relative URLs against the source origin (crawled pages)
function remarkRewriteImages(sourceUrl?: string) {
  // Pre-compute the source origin for relative URL resolution
  let sourceOrigin = "";
  if (sourceUrl) {
    try {
      const u = new URL(sourceUrl);
      sourceOrigin = u.origin;
    } catch { /* invalid URL — skip resolution */ }
  }

  return (tree: any) => {
    function walk(node: any) {
      if (node.type === "image" && node.url) {
        if (node.url.startsWith("/assets/")) {
          // Vault asset → proxy through backend
          node.url = `${API_BASE}${node.url}`;
        } else if (
          sourceOrigin &&
          !node.url.startsWith("http://") &&
          !node.url.startsWith("https://") &&
          !node.url.startsWith("data:") &&
          !node.url.startsWith("#")
        ) {
          // Relative URL from crawled page → resolve against source origin
          try {
            node.url = new URL(node.url, sourceUrl).href;
          } catch { /* malformed — leave as-is */ }
        }
      }
      if (node.children) {
        for (const child of node.children) walk(child);
      }
    }
    walk(tree);
  };
}

// ByteMD plugin factory — pass sourceUrl for URL-sourced documents
function imageRewritePlugin(sourceUrl?: string): any {
  return {
    remark: (processor: any) => processor.use(() => remarkRewriteImages(sourceUrl)),
  };
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
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);

const IconGlobe = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

const IconFile = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
    <polyline points="13 2 13 9 20 9"/>
  </svg>
);

const saveStatusConfig: Record<SaveStatus, { text: string; color: string }> = {
  saved:   { text: "Saved",           color: "var(--success)" },
  saving:  { text: "Saving…",         color: "var(--text-faint)" },
  unsaved: { text: "Unsaved changes", color: "var(--warn)" },
  error:   { text: "Save failed",     color: "var(--error)" },
};

const basePlugins = [gfm()];

export default function DocumentEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { status } = useSidecar();

  const [doc, setDoc] = useState<Document | null>(null);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");

  const [editorKey, setEditorKey] = useState(0);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build plugins list — include source URL for URL-sourced docs so
  // the remark plugin can resolve relative image paths.
  const editorPlugins = useMemo(() => {
    const sourceUrl = doc?.source_type === "url" ? doc.original_path : undefined;
    return [...basePlugins, imageRewritePlugin(sourceUrl)];
  }, [doc?.source_type, doc?.original_path]);

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

  // Force ByteMD/CodeMirror to remount when container is resized (e.g. window maximize).
  // CodeMirror v5 calculates heights at mount time and does not auto-reflow on resize.
  useEffect(() => {
    const el = editorContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
      resizeDebounceRef.current = setTimeout(() => {
        setEditorKey((k) => k + 1);
      }, 150);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
    };
  }, []);

  const handleContentChange = (v: string) => {
    setContent(v);
    scheduleSave(v);
  };

  const handleDelete = async () => {
    if (!id) return;
    try { await apiDelete(`/api/documents/${id}`); navigate("/"); } catch { /* keep open */ }
  };

  const toolbarStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    borderBottom: "1px solid var(--border)",
    padding: "0 12px",
    height: 44,
    background: "var(--surface)",
    flexShrink: 0,
  };

  // Skeleton loading
  if (status !== "ready" || loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={toolbarStyle}>
          <div className="shimmer" style={{ width: 24, height: 24, borderRadius: 6 }} />
          <div className="shimmer" style={{ width: 180, height: 13, marginLeft: 4 }} />
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {[72, 72, 90].map((w, i) => <div key={i} className="shimmer" style={{ width: w, height: 26, borderRadius: 20 }} />)}
          </div>
        </div>
        <div style={{ padding: "32px 36px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="shimmer" style={{ width: "55%", height: 15 }} />
          <div className="shimmer" style={{ width: "80%", height: 13 }} />
          <div className="shimmer" style={{ width: "70%", height: 13 }} />
          <div className="shimmer" style={{ width: "90%", height: 13 }} />
          <div className="shimmer" style={{ width: "45%", height: 13 }} />
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
            <p style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 14 }}>{error || "Document not found"}</p>
            <button onClick={() => navigate("/")} className="btn-ghost" style={{ fontSize: 13 }}>
              <IconBack /> Back to documents
            </button>
          </div>
        </div>
      </div>
    );
  }

  const statusInfo = saveStatusConfig[saveStatus];

  const sourceBadge = (
    <span className="badge" style={{ gap: 5 }}>
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

        <div style={{ width: 1, height: 16, background: "var(--border)", flexShrink: 0, margin: "0 2px" }} />

        <h1 style={{
          fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", margin: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220,
        }}>
          {doc.title || doc.filename || `Document ${id}`}
        </h1>

        {sourceBadge}

        <div style={{ flex: 1 }} />

        {/* Save status dot */}
        <span style={{ fontSize: 11, color: statusInfo.color, letterSpacing: "0.3px", flexShrink: 0, transition: "color 0.2s" }}>
          {statusInfo.text}
        </span>

        {/* Download */}
        <button
          className="btn-icon"
          title="Download as .md"
          onClick={() => {
            if (id) {
              window.open(`${API_BASE}/api/documents/${id}/download`, "_blank");
            }
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>

        {/* Chat toggle */}
        <button
          id="chat-with-doc-btn"
          onClick={() => setShowChat((v) => !v)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 13px", fontSize: 12, fontWeight: 400,
            borderRadius: "var(--radius-pill)",
            border: `1px solid ${showChat ? "var(--border-strong)" : "var(--border)"}`,
            cursor: "pointer", transition: "all 0.15s",
            background: showChat ? "var(--surface-alt)" : "transparent",
            color: showChat ? "var(--text-primary)" : "var(--text-muted)",
            fontFamily: "inherit",
          }}
          title="Chat with this document (RAG)"
        >
          <IconChat />
          Chat
        </button>

        {/* Delete */}
        {showDeleteConfirm ? (
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0, padding: "0 4px" }}>
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
      <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>
        
        <div
          ref={editorContainerRef}
          className="bytemd-wrapper"
          style={{ position: "relative", flex: 1, overflow: "hidden", minWidth: 0, background: "var(--bg)" }}
        >
          <Editor
            key={editorKey}
            value={content}
            plugins={editorPlugins}
            onChange={handleContentChange}
          />
        </div>

        {/* Chat panel — slide in from right */}
        {showChat && id && (
          <div style={{
            width: 380, flexShrink: 0, borderLeft: "1px solid var(--border)", overflow: "hidden",
            animation: "slideInRight 0.22s cubic-bezier(0.22, 1, 0.36, 1) both",
          }}>
            <ChatPanel docId={id} onClose={() => setShowChat(false)} />
          </div>
        )}
      </div>
    </div>
  );
}
