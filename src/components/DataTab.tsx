import { useEffect, useCallback } from "react";
import { apiGet, apiPost } from "../lib/sidecar";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

interface BackupStats { folders: number; documents: number; chat_messages: number; }
interface BackupManifest { format_version: number; app_version: string; created_at: string; stats: BackupStats; }
interface PreviewResult { valid: boolean; manifest?: BackupManifest; error?: string; }

// ── Helpers ───────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

// ── Card header ───────────────────────────────────────────────────

function CardHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
      <div style={{
        width: 32, height: 32, borderRadius: 9,
        background: "var(--accent-subtle)",
        border: "1px solid var(--border-glow)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--accent-text)",
      }}>
        {icon}
      </div>
      <h2 style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.1px" }}>
        {title}
      </h2>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────

function Spinner({ size = 11 }: { size?: number }) {
  return (
    <span className="spin" style={{
      display: "inline-block", width: size, height: size,
      border: "1.5px solid var(--border)", borderTopColor: "var(--accent)",
      borderRadius: "50%",
    }} />
  );
}

// ── Icons ─────────────────────────────────────────────────────────

const IconExport = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IconImport = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const IconStats = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" />
  </svg>
);

// ── Modal overlay ─────────────────────────────────────────────────

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      animation: "fadeIn 0.15s ease-out",
    }} onClick={onClose}>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 14, padding: "28px 32px", maxWidth: 460, width: "90%",
        boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        animation: "fadeIn 0.18s ease-out",
      }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ── Main DataTab component ────────────────────────────────────────

export interface DataTabProps {
  stats: BackupStats | null;
  setStats: (s: BackupStats | null) => void;
  exporting: boolean;
  setExporting: (v: boolean) => void;
  importing: boolean;
  setImporting: (v: boolean) => void;
  dataMsg: { type: "success" | "error"; text: string } | null;
  setDataMsg: (v: { type: "success" | "error"; text: string } | null) => void;
  importPreview: PreviewResult | null;
  setImportPreview: (v: PreviewResult | null) => void;
  pendingImportPath: string | null;
  setPendingImportPath: (v: string | null) => void;
  confirmReplace: boolean;
  setConfirmReplace: (v: boolean) => void;
}

export default function DataTab({
  stats, setStats, exporting, setExporting, importing, setImporting,
  dataMsg, setDataMsg, importPreview, setImportPreview,
  pendingImportPath, setPendingImportPath, confirmReplace, setConfirmReplace,
}: DataTabProps) {

  // Fetch stats on mount
  useEffect(() => {
    apiGet<BackupStats>("/api/backup/stats")
      .then(setStats)
      .catch(() => {});
  }, [setStats]);

  // ── Export handler ─────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    setDataMsg(null);
    setExporting(true);

    try {
      let targetPath: string | null = null;

      if (isTauri) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const today = new Date().toISOString().slice(0, 10);
        targetPath = await save({
          defaultPath: `laidocs-backup-${today}.laidocs-backup`,
          filters: [{ name: "LAIDocs Backup", extensions: ["laidocs-backup"] }],
        });
      } else {
        targetPath = prompt("Enter file path to save backup:");
      }

      if (!targetPath) { setExporting(false); return; }

      const result = await apiPost<{ success: boolean; file_size: number; stats: BackupStats }>(
        "/api/backup/export", { target_path: targetPath }
      );

      if (result.success) {
        setDataMsg({ type: "success", text: `Backup saved successfully (${formatBytes(result.file_size)})` });
        setStats(result.stats);
      }
    } catch (err: unknown) {
      setDataMsg({ type: "error", text: (err as Error).message });
    } finally {
      setExporting(false);
    }
  }, [setDataMsg, setExporting, setStats]);

  // ── Import: open file picker + preview ─────────────────────────
  const handleImportPick = useCallback(async () => {
    setDataMsg(null);

    try {
      let sourcePath: string | null = null;

      if (isTauri) {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const result = await open({
          multiple: false,
          directory: false,
          filters: [{ name: "LAIDocs Backup", extensions: ["laidocs-backup"] }],
        });
        sourcePath = result as string | null;
      } else {
        sourcePath = prompt("Enter backup file path:");
      }

      if (!sourcePath) return;

      setPendingImportPath(sourcePath);
      const preview = await apiPost<PreviewResult>("/api/backup/preview", { source_path: sourcePath });

      if (!preview.valid) {
        setDataMsg({ type: "error", text: preview.error || "Invalid backup file" });
        setPendingImportPath(null);
        return;
      }

      setImportPreview(preview);
    } catch (err: unknown) {
      setDataMsg({ type: "error", text: (err as Error).message });
    }
  }, [setDataMsg, setPendingImportPath, setImportPreview]);

  // ── Import: execute ────────────────────────────────────────────
  const executeImport = useCallback(async (mode: "replace" | "merge") => {
    if (!pendingImportPath) return;
    setImportPreview(null);
    setConfirmReplace(false);
    setImporting(true);
    setDataMsg(null);

    try {
      const result = await apiPost<{ success: boolean; imported: Record<string, number> }>(
        "/api/backup/import", { source_path: pendingImportPath, mode }
      );

      if (result.success) {
        const imported = result.imported;
        const docCount = imported.documents ?? imported.folders ?? 0;
        setDataMsg({
          type: "success",
          text: mode === "replace"
            ? `Data restored successfully (${docCount} documents)`
            : `Merged ${imported.documents ?? 0} new documents (${imported.skipped ?? 0} skipped)`,
        });
        // Refresh stats
        apiGet<BackupStats>("/api/backup/stats").then(setStats).catch(() => {});
      }
    } catch (err: unknown) {
      setDataMsg({ type: "error", text: (err as Error).message });
    } finally {
      setImporting(false);
      setPendingImportPath(null);
    }
  }, [pendingImportPath, setImportPreview, setConfirmReplace, setImporting, setDataMsg, setStats, setPendingImportPath]);

  const closeModals = () => {
    setImportPreview(null);
    setConfirmReplace(false);
    setPendingImportPath(null);
  };

  // ── Stat pill ─────────────────────────────────────────────────
  const StatPill = ({ label, value }: { label: string; value: number }) => (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "14px 20px", borderRadius: 10, flex: 1, minWidth: 100,
      background: "var(--surface-alt)", border: "1px solid var(--border)",
    }}>
      <span style={{ fontSize: 22, fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.5px" }}>
        {value}
      </span>
      <span style={{ fontSize: 10, color: "var(--text-faint)", letterSpacing: "1.2px", textTransform: "uppercase", marginTop: 4 }}>
        {label}
      </span>
    </div>
  );

  return (
    <>
      {/* Stats card */}
      <div className="warp-card" style={{ marginBottom: 14 }}>
        <CardHeader icon={<IconStats />} title="Current Data" />
        {stats ? (
          <div style={{ display: "flex", gap: 10 }}>
            <StatPill label="Folders" value={stats.folders} />
            <StatPill label="Documents" value={stats.documents} />
            <StatPill label="Chat Messages" value={stats.chat_messages} />
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-faint)", fontSize: 13 }}>
            <Spinner /> Loading stats…
          </div>
        )}
      </div>

      {/* Export card */}
      <div className="warp-card" style={{ marginBottom: 14 }}>
        <CardHeader icon={<IconExport />} title="Export Data" />
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 16px" }}>
          Create a complete backup of your documents, folders, assets, and chat history.
          LLM settings are <em>not</em> included for security.
        </p>
        <button
          type="button"
          disabled={exporting}
          onClick={handleExport}
          className="btn-ghost"
          style={{ fontSize: 12, padding: "8px 22px" }}
        >
          {exporting ? (
            <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Spinner /> Exporting…
            </span>
          ) : "Export Data"}
        </button>
      </div>

      {/* Import card */}
      <div className="warp-card" style={{ marginBottom: 14 }}>
        <CardHeader icon={<IconImport />} title="Import Data" />
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 16px" }}>
          Restore data from a previously exported <code style={{
            fontSize: 12, padding: "1px 5px", borderRadius: 4,
            background: "var(--surface-alt)", border: "1px solid var(--border)",
          }}>.laidocs-backup</code> file.
        </p>
        <button
          type="button"
          disabled={importing}
          onClick={handleImportPick}
          className="btn-ghost"
          style={{ fontSize: 12, padding: "8px 22px" }}
        >
          {importing ? (
            <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Spinner /> Importing…
            </span>
          ) : "Import Data"}
        </button>
      </div>

      {/* Message toast */}
      {dataMsg && (
        <div style={{
          padding: "11px 16px", borderRadius: 10, fontSize: 12, marginBottom: 14,
          color: dataMsg.type === "success" ? "var(--success)" : "var(--error)",
          background: dataMsg.type === "success" ? "var(--success-bg)" : "var(--error-bg)",
          border: `1px solid ${dataMsg.type === "success" ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)"}`,
          lineHeight: 1.55, animation: "fadeIn 0.18s ease-out",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          {dataMsg.type === "success" ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
          )}
          <span>{dataMsg.text}</span>
        </div>
      )}

      {/* Import preview modal */}
      {importPreview?.valid && importPreview.manifest && (
        <Modal onClose={closeModals}>
          <h3 style={{ fontSize: 16, fontWeight: 500, color: "var(--text-primary)", margin: "0 0 16px" }}>
            Import Backup
          </h3>
          <div style={{
            padding: "14px 16px", borderRadius: 10, marginBottom: 18,
            background: "var(--surface-alt)", border: "1px solid var(--border)",
            fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7,
          }}>
            <div><strong>Created:</strong> {formatDate(importPreview.manifest.created_at)}</div>
            <div><strong>App version:</strong> {importPreview.manifest.app_version}</div>
            <div style={{ marginTop: 8 }}>
              <strong>Contains:</strong>{" "}
              {importPreview.manifest.stats.documents} documents,{" "}
              {importPreview.manifest.stats.folders} folders,{" "}
              {importPreview.manifest.stats.chat_messages} chat messages
            </div>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 18, lineHeight: 1.5 }}>
            Choose how to import this backup:
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-ghost" style={{ fontSize: 12, padding: "8px 18px", flex: 1 }}
              onClick={() => { setImportPreview(null); setConfirmReplace(true); }}>
              Replace All
            </button>
            <button className="btn-accent" style={{ fontSize: 12, padding: "8px 18px", flex: 1 }}
              onClick={() => executeImport("merge")}>
              Merge
            </button>
            <button className="btn-ghost" style={{ fontSize: 12, padding: "8px 18px", opacity: 0.6 }}
              onClick={closeModals}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* Replace confirmation modal */}
      {confirmReplace && (
        <Modal onClose={closeModals}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2" strokeLinecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <h3 style={{ fontSize: 16, fontWeight: 500, color: "var(--text-primary)", margin: 0 }}>
              Confirm Replace
            </h3>
          </div>
          <p style={{
            fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6,
            marginBottom: 20, padding: "12px 16px", borderRadius: 8,
            background: "var(--error-bg)", border: "1px solid rgba(248,113,113,0.15)",
          }}>
            This will <strong>delete all current data</strong> and replace it with the backup.
            This action cannot be undone.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button className="btn-ghost" style={{ fontSize: 12, padding: "8px 18px" }}
              onClick={closeModals}>
              Cancel
            </button>
            <button style={{
              fontSize: 12, padding: "8px 18px", borderRadius: 8, border: "none",
              background: "var(--error)", color: "#fff", cursor: "pointer",
              fontFamily: "inherit", fontWeight: 500,
            }} onClick={() => executeImport("replace")}>
              Yes, Replace All Data
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
