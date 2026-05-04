import { useEffect, useState, useCallback } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "../lib/sidecar";
import { useFolderContext } from "../context/FolderContext";

interface Folder {
  path: string;
  name: string;
  document_count: number;
}

// ── SVG Icons ──────────────────────────────────────────────────────
const IconDocs = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <line x1="10" y1="9" x2="8" y2="9"/>
  </svg>
);

const IconSearch = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <path d="m21 21-4.3-4.3"/>
  </svg>
);

const IconFolder = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);

const IconSettings = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

// ── Sidebar ────────────────────────────────────────────────────────
export default function Sidebar() {
  const { activeFolder, setActiveFolder, refreshFoldersKey, triggerRefreshFolders } =
    useFolderContext();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderError, setNewFolderError] = useState("");
  const location = useLocation();
  const navigate = useNavigate();

  const fetchFolders = useCallback(async () => {
    try {
      const data = await apiGet<Folder[]>("/api/folders/");
      setFolders(data);
    } catch {
      setFolders([]);
    }
  }, [refreshFoldersKey]);

  useEffect(() => { fetchFolders(); }, [fetchFolders]);

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) { setNewFolderError("Name is required"); return; }
    setNewFolderError("");
    try {
      await apiPost("/api/folders/", { path: name, name });
      setNewFolderName("");
      setShowNewFolder(false);
      triggerRefreshFolders();
    } catch (err) {
      setNewFolderError(err instanceof Error ? err.message : "Failed to create folder");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCreateFolder();
    if (e.key === "Escape") { setShowNewFolder(false); setNewFolderName(""); setNewFolderError(""); }
  };

  const isDocsPage = location.pathname === "/";

  const navItemStyle = (active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "10px",
    width: "100%",
    padding: "8px 12px",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: 400,
    color: active ? "var(--text-primary)" : "var(--text-muted)",
    background: active ? "var(--surface-alt)" : "transparent",
    border: "none",
    cursor: "pointer",
    transition: "color 0.15s ease, background 0.15s ease",
    textDecoration: "none",
    textAlign: "left" as const,
  });

  return (
    <aside style={{
      width: 240,
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "var(--surface)",
      borderRight: "1px solid var(--border)",
    }}>
      {/* Brand */}
      <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid var(--border)" }}>
        <button
          onClick={() => { setActiveFolder(null); navigate("/"); }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 500, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.18px" }}>
            LAIDocs
          </h1>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "2px 0 0", letterSpacing: "1.4px", textTransform: "uppercase" }}>
            Knowledge Base
          </p>
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "12px 12px 0" }}>
        {/* All Documents */}
        <button
          onClick={() => { setActiveFolder(null); navigate("/"); }}
          style={navItemStyle(isDocsPage && activeFolder === null)}
        >
          <IconDocs />
          All Documents
        </button>

        {/* Search */}
        <NavLink
          to="/search"
          style={({ isActive }) => ({ ...navItemStyle(isActive), marginTop: 2 })}
        >
          <IconSearch />
          Search
        </NavLink>

        {/* Folders section */}
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px 8px" }}>
            <span className="label-upper">Folders</span>
            <button
              onClick={() => setShowNewFolder(!showNewFolder)}
              className="btn-icon"
              title="New Folder"
              style={{ width: 22, height: 22 }}
            >
              <IconPlus />
            </button>
          </div>

          {/* New folder input */}
          {showNewFolder && (
            <div style={{ marginBottom: 8 }}>
              <input
                type="text"
                autoFocus
                value={newFolderName}
                onChange={(e) => { setNewFolderName(e.target.value); setNewFolderError(""); }}
                onKeyDown={handleKeyDown}
                placeholder="Folder name…"
                className="warp-input"
                style={{ fontSize: 13, padding: "6px 10px", marginBottom: 4 }}
              />
              {newFolderError && (
                <p style={{ fontSize: 12, color: "var(--error)", margin: "0 0 4px" }}>{newFolderError}</p>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button onClick={handleCreateFolder} style={{ fontSize: 12, color: "var(--text-secondary)", background: "none", border: "none", cursor: "pointer" }}>Create</button>
                <button onClick={() => { setShowNewFolder(false); setNewFolderName(""); setNewFolderError(""); }} style={{ fontSize: 12, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          )}

          {/* Folder list */}
          {folders.length === 0 && !showNewFolder ? (
            <p style={{ fontSize: 12, color: "var(--text-muted)", padding: "0 4px", fontStyle: "italic" }}>No folders yet</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {folders.map((folder) => {
                const isActive = isDocsPage && activeFolder === folder.path;
                return (
                  <button
                    key={folder.path}
                    onClick={() => setActiveFolder(folder.path)}
                    style={{
                      ...navItemStyle(isActive),
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                      <IconFolder />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {folder.name || folder.path}
                      </span>
                    </span>
                    <span style={{
                      flexShrink: 0,
                      fontSize: 10,
                      letterSpacing: "0.5px",
                      color: "var(--text-muted)",
                      background: "var(--surface-alt)",
                      borderRadius: 4,
                      padding: "1px 6px",
                    }}>
                      {folder.document_count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </nav>

      {/* Settings */}
      <div style={{ padding: "12px", borderTop: "1px solid var(--border)" }}>
        <NavLink
          to="/settings"
          style={({ isActive }) => ({ ...navItemStyle(isActive) })}
        >
          <IconSettings />
          Settings
        </NavLink>
      </div>
    </aside>
  );
}
