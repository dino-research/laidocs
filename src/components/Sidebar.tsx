import { useEffect, useState, useCallback } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "../lib/sidecar";
import { useFolderContext } from "../context/FolderContext";
import { useSidecar } from "../hooks/useSidecar";

interface Folder {
  path: string;
  name: string;
  document_count: number;
}

// ── SVG Icons ──────────────────────────────────────────────────────
const IconDocs = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <line x1="10" y1="9" x2="8" y2="9"/>
  </svg>
);

const IconSearch = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <path d="m21 21-4.3-4.3"/>
  </svg>
);

const IconFolder = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);

const IconSettings = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

const IconPlus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

// ── Nav Item ───────────────────────────────────────────────────────
function NavItem({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 9,
        width: "100%",
        padding: "7px 12px 7px 14px",
        borderRadius: 7,
        fontSize: 13.5,
        fontWeight: active ? 500 : 400,
        color: active ? "var(--text-primary)" : "var(--text-muted)",
        background: active ? "var(--surface-alt)" : "transparent",
        border: "none",
        cursor: "pointer",
        transition: "color 0.15s ease, background 0.15s ease",
        textDecoration: "none",
        textAlign: "left",
      }}
    >
      {active && <span className="nav-item-active-bar" />}
      {children}
    </button>
  );
}

const IconRefresh = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);

function ReloadButton() {
  const [spinning, setSpinning] = useState(false);

  const handleReload = () => {
    setSpinning(true);
    setTimeout(() => window.location.reload(), 300);
  };

  return (
    <button
      onClick={handleReload}
      title="Reload app"
      style={{
        flexShrink: 0,
        width: 28,
        height: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 7,
        border: "none",
        background: "transparent",
        color: "var(--text-faint)",
        cursor: "pointer",
        transition: "color 0.15s, background 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--text-muted)";
        e.currentTarget.style.background = "var(--surface-alt)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--text-faint)";
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span className={spinning ? "spin" : ""} style={{ display: "flex" }}>
        <IconRefresh />
      </span>
    </button>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────
export default function Sidebar() {
  const { activeFolder, setActiveFolder, refreshFoldersKey, triggerRefreshFolders } =
    useFolderContext();
  const { status } = useSidecar();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderError, setNewFolderError] = useState("");
  const [creating, setCreating] = useState(false);
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

  useEffect(() => {
    if (status !== "ready") return;
    fetchFolders();
  }, [status, fetchFolders]);

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) { setNewFolderError("Name is required"); return; }
    setNewFolderError("");
    setCreating(true);
    try {
      await apiPost("/api/folders/", { path: name, name });
      setNewFolderName("");
      setShowNewFolder(false);
      triggerRefreshFolders();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create folder";
      if (msg.includes("409")) {
        setNewFolderError(`A folder named "${name}" already exists`);
      } else {
        setNewFolderError(msg);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCreateFolder();
    if (e.key === "Escape") { setShowNewFolder(false); setNewFolderName(""); setNewFolderError(""); }
  };

  const isDocsPage = location.pathname === "/";
  const isSearchPage = location.pathname === "/search";
  const isSettingsPage = location.pathname === "/settings";

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
      <div style={{ padding: "18px 16px 14px", borderBottom: "1px solid var(--border)" }}>
        <button
          onClick={() => { setActiveFolder(null); navigate("/"); }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", width: "100%", display: "flex", alignItems: "center", gap: 10 }}
        >
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: "var(--surface-alt)",
            border: "1px solid var(--border-strong)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.2px", lineHeight: 1 }}>
              LAIDocs
            </div>
            <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 3, letterSpacing: "1.2px", textTransform: "uppercase" }}>
              Knowledge Base
            </div>
          </div>
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "10px 8px 0" }}>
        {/* All Documents */}
        <NavItem active={isDocsPage && activeFolder === null} onClick={() => { setActiveFolder(null); navigate("/"); }}>
          <IconDocs />
          All Documents
        </NavItem>

        {/* Search */}
        <div style={{ marginTop: 2 }}>
          <NavItem active={isSearchPage} onClick={() => navigate("/search")}>
            <IconSearch />
            Search
          </NavItem>
        </div>

        {/* Folders section */}
        <div style={{ marginTop: 20 }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 6px 8px",
          }}>
            <span className="label-upper">Folders</span>
            <button
              onClick={() => { setShowNewFolder(!showNewFolder); setNewFolderName(""); setNewFolderError(""); }}
              className="btn-icon"
              title="New Folder"
              style={{ width: 20, height: 20, borderRadius: 4 }}
            >
              <IconPlus />
            </button>
          </div>

          {/* New folder input */}
          {showNewFolder && (
            <div style={{ marginBottom: 8, padding: "0 2px", animation: "fadeIn 0.18s ease-out" }}>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => { setNewFolderName(e.target.value); setNewFolderError(""); }}
                  onKeyDown={handleKeyDown}
                  placeholder="Folder name…"
                  className="warp-input"
                  style={{ fontSize: 13, padding: "6px 10px", borderRadius: 6 }}
                />
              </div>
              {newFolderError && (
                <p style={{ fontSize: 11, color: "var(--error)", margin: "4px 0 0 2px" }}>{newFolderError}</p>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button
                  onClick={handleCreateFolder}
                  disabled={creating}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    fontSize: 12, color: "var(--text-secondary)", background: "var(--surface-alt)",
                    border: "1px solid var(--border)", borderRadius: 5, cursor: "pointer",
                    padding: "4px 10px", transition: "border-color 0.15s", opacity: creating ? 0.6 : 1,
                  }}
                >
                  {creating ? <span className="spin" style={{ display: "inline-block", width: 10, height: 10, border: "1.5px solid var(--border)", borderTopColor: "var(--text-muted)", borderRadius: "50%" }} /> : <IconCheck />}
                  Create
                </button>
                <button
                  onClick={() => { setShowNewFolder(false); setNewFolderName(""); setNewFolderError(""); }}
                  style={{ fontSize: 12, color: "var(--text-faint)", background: "none", border: "none", cursor: "pointer", padding: "4px 6px" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Folder list */}
          {folders.length === 0 && !showNewFolder ? (
            <p style={{ fontSize: 12, color: "var(--text-faint)", padding: "2px 8px", fontStyle: "italic" }}>No folders yet</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }} className="stagger-children">
              {folders.map((folder) => {
                const isActive = isDocsPage && activeFolder === folder.path;
                return (
                  <button
                    key={folder.path}
                    onClick={() => { setActiveFolder(folder.path); navigate("/"); }}
                    style={{
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      padding: "6px 12px 6px 14px",
                      borderRadius: 7,
                      fontSize: 13,
                      fontWeight: isActive ? 500 : 400,
                      color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                      background: isActive ? "var(--surface-alt)" : "transparent",
                      border: "none",
                      cursor: "pointer",
                      transition: "color 0.15s ease, background 0.15s ease",
                      textAlign: "left",
                      justifyContent: "space-between",
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = isActive ? "var(--surface-alt)" : "var(--surface-hover)"; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = isActive ? "var(--surface-alt)" : "transparent"; }}
                  >
                    {isActive && <span className="nav-item-active-bar" />}
                    <span style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden", flex: 1 }}>
                      <span style={{ color: "var(--text-faint)", flexShrink: 0 }}><IconFolder /></span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {folder.name || folder.path}
                      </span>
                    </span>
                    <span style={{
                      flexShrink: 0,
                      fontSize: 10,
                      letterSpacing: "0.3px",
                      color: "var(--text-faint)",
                      background: "var(--surface-alt)",
                      border: "1px solid var(--border)",
                      borderRadius: 3,
                      padding: "1px 5px",
                      fontVariantNumeric: "tabular-nums",
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

      {/* Footer: Settings + Reload */}
      <div style={{ padding: "8px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 4 }}>
        <div style={{ flex: 1 }}>
          <NavItem active={isSettingsPage} onClick={() => navigate("/settings")}>
            <IconSettings />
            Settings
          </NavItem>
        </div>
        <ReloadButton />
      </div>
    </aside>
  );
}
