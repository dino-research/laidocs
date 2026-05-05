import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSidecar } from "../hooks/useSidecar";
import { apiGet, apiPut, apiDelete } from "../lib/sidecar";
import { Editor } from "@bytemd/react";
import gfm from "@bytemd/plugin-gfm";
import "bytemd/dist/index.css";
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

const plugins = [gfm()];

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
        
        {/* Style injection for ByteMD to match our theme */}
        <style>{`
          /* bytemd-wrapper is position:relative (set inline).                    */
          /* Both the React wrapper div and .bytemd use position:absolute;inset:0 */
          /* so they always fill 100% of the container — bypassing all flex/block */
          /* width-resolution issues entirely. This is the most robust approach.  */
          .bytemd-wrapper > div {
            position: absolute !important;
            inset: 0 !important;
          }

          /* .bytemd fills its absolutely-positioned parent */
          .bytemd {
            width: 100% !important;
            height: 100% !important;
            border: none !important;
            background: var(--bg) !important;
            font-family: system-ui, -apple-system, sans-serif;
          }

          /* ── Toolbar ──────────────────────────────────────────── */
          .bytemd-toolbar {
            background: var(--surface) !important;
            border-bottom: 1px solid var(--border) !important;
            padding: 2px 10px !important;
            box-sizing: border-box !important;
          }

          /* All toolbar icons: clearly visible */
          .bytemd-toolbar-icon {
            color: var(--text-secondary) !important;
            border-radius: 5px !important;
            transition: background 0.15s, color 0.15s !important;
            cursor: pointer !important;
          }
          .bytemd-toolbar-icon svg {
            color: inherit !important;
            stroke: currentColor !important;
          }
          .bytemd-toolbar-icon:hover {
            background: var(--surface-alt) !important;
            color: var(--text-primary) !important;
          }
          .bytemd-toolbar-icon.bytemd-toolbar-icon-active {
            background: var(--surface-alt) !important;
            color: var(--text-primary) !important;
          }

          /* Write / Preview tab labels */
          .bytemd-toolbar-tab {
            color: var(--text-muted) !important;
            font-size: 12px !important;
            padding: 3px 8px !important;
            border-radius: 4px !important;
            transition: color 0.15s !important;
            cursor: pointer !important;
          }
          .bytemd-toolbar-tab:hover {
            color: var(--text-secondary) !important;
          }
          .bytemd-toolbar-tab-active {
            color: var(--text-primary) !important;
            font-weight: 500 !important;
          }

          /* ── Hide GitHub & Fullscreen buttons ─────────────────── */
          .bytemd-toolbar-right .bytemd-toolbar-icon:nth-last-child(-n+2) {
            display: none !important;
          }

          /* ── .bytemd-body must have explicit width so that            */
          /* .bytemd-editor's width:calc(100%) resolves against the full  */
          /* container in Write-only mode (ByteMD uses inline-block).      */
          /* Do NOT override width on bytemd-editor/preview — ByteMD's    */
          /* JS sets those inline and we must not fight it.                */
          .bytemd-body {
            background: var(--bg) !important;
            min-height: 0 !important;
            width: 100% !important;
            display: block !important;
          }
          .bytemd-editor {
            background: var(--bg) !important;
          }
          .bytemd-preview {
            background: var(--bg) !important;
            overflow-x: hidden !important;
          }
          .bytemd-status {
            background: var(--surface) !important;
            border-top: 1px solid var(--border) !important;
            color: var(--text-faint) !important;
            font-size: 11px !important;
          }

          /* Split mode: show divider between editor and preview panes.    */
          /* ByteMD adds .bytemd-split on the root .bytemd element.        */
          .bytemd-split .bytemd-editor {
            border-right: 1px solid var(--border) !important;
          }

          /* ── CodeMirror (editor pane) ─────────────────────────── */
          .CodeMirror {
            background: transparent !important;
            color: var(--text-secondary) !important;
            font-family: 'Geist Mono', 'Courier New', monospace !important;
            font-size: 13px !important;
            line-height: 1.75 !important;
            letter-spacing: 0.01em !important;
          }
          .CodeMirror-scroll {
            padding: 12px 0 !important;
          }
          .CodeMirror-gutters {
            background: var(--surface) !important;
            border-right: 1px solid var(--border) !important;
          }
          .CodeMirror-linenumber {
            color: var(--text-faint) !important;
            font-size: 11px !important;
          }
          .CodeMirror-cursor {
            border-left-color: var(--text-primary) !important;
          }
          .CodeMirror-selected {
            background: rgba(99,102,241,0.18) !important;
          }

          /* ── TOC (Table of Contents) panel ────────────────────── */
          .bytemd-toc {
            background: var(--surface-alt) !important;
            border-left: 1px solid var(--border) !important;
          }
          .bytemd-toc-item {
            color: var(--text-secondary) !important;
            font-size: 13px !important;
            line-height: 1.6 !important;
            transition: color 0.15s !important;
            cursor: pointer !important;
          }
          .bytemd-toc-item:hover {
            color: var(--text-primary) !important;
          }
          .bytemd-toc-item-active {
            color: var(--text-primary) !important;
            font-weight: 500 !important;
          }
          .bytemd-toc h2 {
            color: var(--text-muted) !important;
            font-size: 10px !important;
            font-weight: 600 !important;
            letter-spacing: 0.08em !important;
            text-transform: uppercase !important;
          }

          /* ── Dropdown / Popover menus ─────────────────────────── */
          .bytemd-dropdown {
            background: var(--surface-alt) !important;
            border: 1px solid var(--border) !important;
            border-radius: 8px !important;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4) !important;
          }
          .bytemd-dropdown-item {
            color: var(--text-secondary) !important;
            font-size: 13px !important;
            transition: background 0.12s !important;
            cursor: pointer !important;
          }
          .bytemd-dropdown-item:hover {
            background: var(--surface) !important;
            color: var(--text-primary) !important;
          }
          .bytemd-help-title {
            color: var(--text-muted) !important;
            font-size: 10px !important;
            text-transform: uppercase !important;
            letter-spacing: 0.06em !important;
          }
          .bytemd-help td, .bytemd-help th {
            color: var(--text-secondary) !important;
            font-size: 12px !important;
            border-bottom: 1px solid var(--border) !important;
          }

          /* ── Markdown Viewer (Preview pane) ───────────────────── */
          .markdown-body {
            background: var(--bg) !important;
            color: var(--text-secondary) !important;
            font-family: system-ui, -apple-system, sans-serif !important;
            padding: 28px 32px !important;
            font-size: 15px !important;
            line-height: 1.75 !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            overflow-x: hidden !important;
          }
          .markdown-body h1 {
            font-size: 22px !important; font-weight: 500 !important; color: var(--text-primary) !important;
            margin-bottom: 14px !important; margin-top: 28px !important; padding-bottom: 8px !important;
            border-bottom: 1px solid var(--border) !important; line-height: 1.3 !important; letter-spacing: -0.3px !important;
          }
          .markdown-body h2 {
            font-size: 18px !important; font-weight: 500 !important; color: var(--text-primary) !important;
            margin-bottom: 10px !important; margin-top: 24px !important; padding-bottom: 6px !important;
            border-bottom: 1px solid var(--border) !important; line-height: 1.35 !important; letter-spacing: -0.2px !important;
          }
          .markdown-body h3 {
            font-size: 15px !important; font-weight: 600 !important; color: var(--text-primary) !important;
            margin-bottom: 8px !important; margin-top: 20px !important; line-height: 1.4 !important;
          }
          .markdown-body h4, .markdown-body h5, .markdown-body h6 {
            color: var(--text-secondary) !important; font-weight: 600 !important; margin-top: 16px !important;
          }
          .markdown-body p, .markdown-body li {
            color: var(--text-secondary) !important; margin-bottom: 12px !important; line-height: 1.75 !important; font-size: 14px !important;
          }
          .markdown-body ul, .markdown-body ol {
            padding-left: 1.4em !important; margin-bottom: 14px !important;
          }
          .markdown-body a {
            color: var(--text-link, #6366f1) !important; text-decoration: underline !important; text-underline-offset: 3px !important;
          }
          .markdown-body a:hover {
            opacity: 0.8 !important;
          }
          .markdown-body blockquote {
            border-left: 3px solid var(--border-strong) !important;
            color: var(--text-muted) !important; font-style: italic !important;
            background: var(--surface-alt) !important; border-radius: 0 6px 6px 0 !important;
            padding: 10px 16px !important; margin: 16px 0 !important;
          }
          .markdown-body code {
            background: var(--surface-alt) !important; color: var(--text-secondary) !important;
            padding: 2px 6px !important; border-radius: 4px !important; font-size: 12.5px !important;
            font-family: 'Geist Mono', 'Courier New', monospace !important; border: 1px solid var(--border) !important;
          }
          .markdown-body pre {
            background: var(--surface-alt) !important; border-radius: 8px !important; padding: 14px 18px !important;
            margin-bottom: 16px !important; border: 1px solid var(--border) !important; overflow-x: auto !important;
          }
          .markdown-body pre code {
            background: transparent !important; border: none !important; padding: 0 !important;
            color: var(--text-muted) !important; font-size: 13px !important;
          }
          .markdown-body table {
            border-collapse: collapse !important; width: 100% !important; margin-bottom: 16px !important;
            font-size: 13.5px !important;
          }
          .markdown-body th {
            color: var(--text-primary) !important; font-weight: 600 !important;
            border-bottom: 2px solid var(--border-strong) !important; padding: 8px 12px !important;
            text-align: left !important; background: var(--surface-alt) !important;
          }
          .markdown-body td {
            color: var(--text-secondary) !important;
            border-bottom: 1px solid var(--border) !important; padding: 7px 12px !important;
          }
          .markdown-body tr:hover td {
            background: var(--surface-alt) !important;
          }
          .markdown-body img {
            border-radius: 8px !important; border: 1px solid var(--border) !important; max-width: 100% !important;
          }
          .markdown-body hr {
            border: none !important; border-top: 1px solid var(--border) !important; margin: 24px 0 !important;
          }
          .markdown-body strong { color: var(--text-primary) !important; font-weight: 600 !important; }
          .markdown-body em { color: var(--text-muted) !important; }
        `}</style>

        <div
          ref={editorContainerRef}
          className="bytemd-wrapper"
          style={{ position: "relative", flex: 1, overflow: "hidden", minWidth: 0, background: "var(--bg)" }}
        >
          <Editor
            key={editorKey}
            value={content}
            plugins={plugins}
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
