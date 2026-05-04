import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/sidecar";

interface Folder { path: string; name: string; document_count: number; }
interface CrawlDialogProps { open: boolean; onClose: () => void; onCrawlSuccess: () => void; }

const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const IconGlobe = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

export default function CrawlDialog({ open, onClose, onCrawlSuccess }: CrawlDialogProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState("");
  const [url, setUrl] = useState("");
  const [crawling, setCrawling] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!open) return;
    apiGet<Folder[]>("/api/folders/").then(setFolders).catch(() => setFolders([]));
    setUrl(""); setSelectedFolder(""); setError(""); setSuccess("");
  }, [open]);

  if (!open) return null;

  const handleCrawl = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) { setError("Please enter a URL"); return; }
    try { new URL(trimmedUrl); } catch { setError("Please enter a valid URL (e.g. https://example.com)"); return; }
    setError(""); setSuccess(""); setCrawling(true);
    try {
      const result = await apiPost<{ title?: string; id?: string }>("/api/documents/crawl", { url: trimmedUrl, folder: selectedFolder });
      setSuccess(`Crawled "${result.title || trimmedUrl}" successfully!`);
      onCrawlSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Crawl failed");
    } finally { setCrawling(false); }
  };

  return (
    <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog-panel">
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 500, color: "var(--text-primary)", margin: 0 }}>Crawl URL</h2>
          <button onClick={onClose} className="btn-icon"><IconX /></button>
        </div>

        {success && (
          <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(109,155,109,0.12)", border: "1px solid rgba(109,155,109,0.3)", borderRadius: 8, fontSize: 13, color: "var(--success)" }}>
            {success}
          </div>
        )}
        {error && (
          <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(192,112,112,0.1)", border: "1px solid rgba(192,112,112,0.3)", borderRadius: 8, fontSize: 13, color: "var(--error)" }}>
            {error}
          </div>
        )}

        {/* URL input */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", letterSpacing: "1.4px", textTransform: "uppercase", marginBottom: 6 }}>URL</label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}>
              <IconGlobe />
            </span>
            <input
              type="text"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !crawling) handleCrawl(); }}
              placeholder="https://example.com"
              autoFocus
              className="warp-input"
              style={{ paddingLeft: 36 }}
            />
          </div>
        </div>

        {/* Folder select */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", letterSpacing: "1.4px", textTransform: "uppercase", marginBottom: 6 }}>Folder</label>
          <select value={selectedFolder} onChange={(e) => setSelectedFolder(e.target.value)} className="warp-input" style={{ appearance: "none" }}>
            <option value="">None</option>
            {folders.map((f) => <option key={f.path} value={f.path}>{f.name || f.path}</option>)}
          </select>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleCrawl} disabled={crawling} className="btn-primary">
            {crawling ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 13, height: 13, border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "var(--text-secondary)", borderRadius: "50%", display: "inline-block" }} className="spin" />
                Crawling…
              </span>
            ) : "Crawl"}
          </button>
        </div>
      </div>
    </div>
  );
}
