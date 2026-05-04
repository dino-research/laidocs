import { useEffect, useRef, useState } from "react";
import { apiGet } from "../lib/sidecar";
import { apiUpload } from "../lib/api-upload";

interface Folder { path: string; name: string; document_count: number; }
interface UploadDialogProps { open: boolean; onClose: () => void; onUploadSuccess: () => void; }

const ACCEPTED_EXTENSIONS = ".pdf,.docx,.pptx,.xlsx,.md,.txt,.html,.csv";

const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const IconUpload = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 16 12 12 8 16"/>
    <line x1="12" y1="12" x2="12" y2="21"/>
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
  </svg>
);

const IconFile = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
    <polyline points="13 2 13 9 20 9"/>
  </svg>
);

export default function UploadDialog({ open, onClose, onUploadSuccess }: UploadDialogProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    apiGet<Folder[]>("/api/folders/").then(setFolders).catch(() => setFolders([]));
    setSelectedFile(null); setSelectedFolder(""); setError(""); setSuccess(""); setDragOver(false);
  }, [open]);

  if (!open) return null;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) { setError("Please select a file"); return; }
    setError(""); setSuccess(""); setUploading(true);
    try {
      await apiUpload("/api/documents/upload", selectedFile, selectedFolder);
      setSuccess(`"${selectedFile.name}" uploaded successfully!`);
      onUploadSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally { setUploading(false); }
  };

  return (
    <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog-panel">
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 500, color: "var(--text-primary)", margin: 0 }}>Upload File</h2>
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

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            marginBottom: 20,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "36px 24px",
            borderRadius: 10,
            border: `2px dashed ${dragOver ? "var(--border-strong)" : "var(--border)"}`,
            background: dragOver ? "var(--surface-alt)" : "transparent",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          <div style={{ color: "var(--text-muted)", marginBottom: 12, opacity: 0.6 }}>
            {selectedFile ? <IconFile /> : <IconUpload />}
          </div>
          {selectedFile ? (
            <>
              <p style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", margin: "0 0 4px" }}>{selectedFile.name}</p>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0, letterSpacing: "1px" }}>{(selectedFile.size / 1024).toFixed(1)} KB</p>
            </>
          ) : (
            <>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 4px" }}>Drag & drop a file here</p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>or click to browse</p>
            </>
          )}
        </div>

        <input ref={fileInputRef} type="file" accept={ACCEPTED_EXTENSIONS} onChange={(e) => { const f = e.target.files?.[0]; if (f) setSelectedFile(f); }} style={{ display: "none" }} />

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
          <button onClick={handleUpload} disabled={uploading || !selectedFile} className="btn-primary">
            {uploading ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 13, height: 13, border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "var(--text-secondary)", borderRadius: "50%", display: "inline-block" }} className="spin" />
                Converting…
              </span>
            ) : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
