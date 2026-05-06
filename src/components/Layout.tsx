import { useState, useCallback, useEffect, useRef } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

// ── Persistence keys ──────────────────────────────────────────────

const KEY_WIDTH = "laidocs-sidebar-width";
const KEY_COLLAPSED = "laidocs-sidebar-collapsed";

const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 180;
const MAX_WIDTH = 400;

function loadWidth(): number {
  try {
    const v = localStorage.getItem(KEY_WIDTH);
    if (v) return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Number(v)));
  } catch { /* ignore */ }
  return DEFAULT_WIDTH;
}

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY_COLLAPSED) === "true";
  } catch { /* ignore */ }
  return false;
}

// ── Layout ────────────────────────────────────────────────────────

export default function Layout() {
  const [width, setWidth] = useState(loadWidth);
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [isDragging, setIsDragging] = useState(false);

  // Persist width
  useEffect(() => { localStorage.setItem(KEY_WIDTH, String(width)); }, [width]);
  // Persist collapsed
  useEffect(() => { localStorage.setItem(KEY_COLLAPSED, String(collapsed)); }, [collapsed]);

  // ── Drag resize logic ───────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (ev: MouseEvent) => {
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, ev.clientX));
      setWidth(next);
    };

    const onMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging]);

  const toggleCollapse = useCallback(() => setCollapsed((c) => !c), []);

  const sidebarWidth = collapsed ? 0 : width;

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg)", color: "var(--text-primary)", overflow: "hidden" }}>
      {/* Sidebar */}
      <div
        style={{
          width: sidebarWidth,
          minWidth: collapsed ? 0 : MIN_WIDTH,
          maxWidth: MAX_WIDTH,
          transition: collapsed ? "width 0.2s ease" : undefined,
          overflow: "hidden",
          flexShrink: 0,
          position: "relative",
        }}
      >
        {!collapsed && (
          <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapse} />
        )}
      </div>

      {/* Drag handle */}
      {!collapsed && (
        <div
          onMouseDown={handleMouseDown}
          className="resize-handle"
        />
      )}

      {/* Collapse expand button (when collapsed) */}
      {collapsed && (
        <button
          onClick={toggleCollapse}
          className="sidebar-expand-btn"
          title="Expand sidebar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

      {/* Main content */}
      <main style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <Outlet />
      </main>
    </div>
  );
}
