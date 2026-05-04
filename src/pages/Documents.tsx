import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiDelete } from "../lib/sidecar";
import { useSidecar } from "../hooks/useSidecar";
import { useFolderContext } from "../context/FolderContext";
import UploadDialog from "../components/UploadDialog";
import CrawlDialog from "../components/CrawlDialog";

interface Document {
  id: string;
  title: string;
  folder: string | null;
  source_type: string;
  content?: string;
  created_at: string;
  updated_at?: string;
}

function relativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

// ── SVG Icons ────────────────────────────────────────────────────
const IconUpload = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 16 12 12 8 16"/>
    <line x1="12" y1="12" x2="12" y2="21"/>
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
  </svg>
);

const IconGlobe = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

const IconFile = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
    <polyline points="13 2 13 9 20 9"/>
  </svg>
);

const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/>
    <path d="M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);

const IconFolder = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);

// ── Loading spinner ───────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{
      width: 20, height: 20,
      border: "2px solid var(--border)",
      borderTopColor: "var(--text-muted)",
      borderRadius: "50%",
    }} className="spin" />
  );
}

// ── Full-screen status ────────────────────────────────────────────
function StatusScreen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>{children}</div>
    </div>
  );
}

export default function Documents() {
  const { status, error } = useSidecar();
  const { activeFolder, triggerRefreshFolders } = useFolderContext();
  const navigate = useNavigate();

  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [crawlOpen, setCrawlOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setFetchError("");
    try {
      const query = activeFolder ? `?folder=${encodeURIComponent(activeFolder)}` : "";
      const data = await apiGet<Document[]>(`/api/documents/${query}`);
      setDocuments(data);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [activeFolder]);

  useEffect(() => {
    if (status !== "ready") return;
    fetchDocuments();
  }, [status, fetchDocuments]);

  const handleDelete = async (docId: string) => {
    try {
      await apiDelete(`/api/documents/${docId}`);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      setDeleteConfirm(null);
      triggerRefreshFolders();
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to delete document");
    }
  };

  // ── States ───────────────────────────────────────────────────
  if (status === "starting") {
    return (
      <StatusScreen>
        <Spinner />
        <p style={{ marginTop: 16, fontSize: 14, color: "var(--text-muted)" }}>Connecting to backend…</p>
      </StatusScreen>
    );
  }

  if (status === "error") {
    return (
      <StatusScreen>
        <p style={{ fontSize: 14, color: "var(--error)" }}>Failed to connect to backend.</p>
        {error && <p style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>{error}</p>}
      </StatusScreen>
    );
  }

  return (
    <div style={{ padding: "32px 40px", height: "100%", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <h1 className="heading-display" style={{ margin: 0 }}>
            {activeFolder ? activeFolder : "Documents"}
          </h1>
          {documents.length > 0 && (
            <p className="label-upper" style={{ marginTop: 8 }}>
              {documents.length} document{documents.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button onClick={() => setUploadOpen(true)} className="btn-primary">
            <IconUpload /> Upload
          </button>
          <button onClick={() => setCrawlOpen(true)} className="btn-ghost">
            <IconGlobe /> Crawl URL
          </button>
        </div>
      </div>

      {/* Error */}
      {fetchError && (
        <div style={{
          marginBottom: 20,
          padding: "12px 16px",
          background: "rgba(192, 112, 112, 0.1)",
          border: "1px solid rgba(192, 112, 112, 0.3)",
          borderRadius: 8,
          fontSize: 13,
          color: "var(--error)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          {fetchError}
          <button onClick={fetchDocuments} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: 12, textDecoration: "underline" }}>
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <Spinner />
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading documents…</p>
          </div>
        </div>
      )}

      {/* Empty */}
      {!loading && documents.length === 0 && !fetchError && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            textAlign: "center",
            border: "1px dashed var(--border-strong)",
            borderRadius: 14,
            padding: "56px 48px",
            maxWidth: 400,
          }}>
            <div style={{ width: 40, height: 40, margin: "0 auto 16px", color: "var(--text-muted)", opacity: 0.5 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <p style={{ fontSize: 16, fontWeight: 400, color: "var(--text-secondary)", margin: "0 0 6px" }}>No documents yet</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 24px" }}>
              Upload a file or crawl a URL to get started.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setUploadOpen(true)} className="btn-primary"><IconUpload /> Upload</button>
              <button onClick={() => setCrawlOpen(true)} className="btn-ghost"><IconGlobe /> Crawl URL</button>
            </div>
          </div>
        </div>
      )}

      {/* Document Grid */}
      {!loading && documents.length > 0 && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          }}>
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="warp-card"
                style={{ cursor: "pointer", position: "relative", padding: "18px 18px 14px" }}
                onClick={() => navigate(`/doc/${doc.id}`)}
              >
                {/* Delete button */}
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirm(doc.id); }}
                  className="btn-icon"
                  title="Delete"
                  style={{
                    position: "absolute", top: 10, right: 10,
                    opacity: 0, transition: "opacity 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
                >
                  <IconTrash />
                </button>

                {/* Delete confirm overlay */}
                {deleteConfirm === doc.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: "absolute", inset: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "rgba(26, 25, 23, 0.92)",
                      borderRadius: "var(--radius-card)",
                      zIndex: 10,
                    }}
                  >
                    <div style={{ textAlign: "center" }}>
                      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>Delete this document?</p>
                      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                          style={{ fontSize: 12, padding: "6px 14px", borderRadius: "var(--radius-pill)", background: "var(--error)", color: "var(--text-primary)", border: "none", cursor: "pointer" }}
                        >Delete</button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null); }}
                          style={{ fontSize: 12, padding: "6px 14px", borderRadius: "var(--radius-pill)", background: "var(--surface-alt)", color: "var(--text-muted)", border: "1px solid var(--border)", cursor: "pointer" }}
                        >Cancel</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Source + Title */}
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8, paddingRight: 20 }}>
                  <span style={{ color: "var(--text-muted)", marginTop: 1, flexShrink: 0 }}>
                    {doc.source_type === "url" ? <IconGlobe /> : <IconFile />}
                  </span>
                  <h3 style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", margin: 0, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {doc.title || "Untitled"}
                  </h3>
                </div>

                {/* Content preview */}
                {doc.content && (
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px", lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {doc.content.substring(0, 140)}{doc.content.length > 140 ? "…" : ""}
                  </p>
                )}

                {/* Footer row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>
                    {doc.folder && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--text-muted)", background: "var(--surface-alt)", borderRadius: 4, padding: "2px 7px", letterSpacing: "0.5px" }}>
                        <IconFolder />{doc.folder}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "1px", textTransform: "uppercase" }}>
                    {relativeTime(doc.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploadSuccess={() => { fetchDocuments(); triggerRefreshFolders(); }}
      />
      <CrawlDialog
        open={crawlOpen}
        onClose={() => setCrawlOpen(false)}
        onCrawlSuccess={() => { fetchDocuments(); triggerRefreshFolders(); }}
      />
    </div>
  );
}
