import { useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────

export interface DocNode {
  id: string;
  title: string;
  filename: string;
  source_type: string;
}

export interface FolderNode {
  path: string;
  name: string;
  parent_path: string | null;
  document_count: number;
  children: FolderNode[];
  documents: DocNode[];
}

interface FileTreeProps {
  tree: FolderNode[];
  activeDocId: string | null;
  onFileClick: (docId: string) => void;
}

// ── Persistence ───────────────────────────────────────────────────

const STORAGE_KEY = "laidocs-tree-expanded";

function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  return new Set();
}

function saveExpanded(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch { /* ignore */ }
}

// ── SVG Icons ─────────────────────────────────────────────────────

const IconChevron = ({ expanded }: { expanded: boolean }) => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{
      transition: "transform 0.15s ease",
      transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
      flexShrink: 0,
    }}
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const IconFolderOpen = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <path d="M2 10h20" />
  </svg>
);

const IconFolderClosed = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const IconFile = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const IconGlobe = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

// ── Indent Guide ──────────────────────────────────────────────────

const INDENT_PX = 20;

function IndentGuides({ depth }: { depth: number }) {
  if (depth === 0) return null;
  return (
    <>
      {Array.from({ length: depth }, (_, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: 8 + i * INDENT_PX,
            top: 0,
            bottom: 0,
            width: 1,
            background: "var(--border)",
          }}
        />
      ))}
    </>
  );
}

// ── TreeFile ──────────────────────────────────────────────────────

function TreeFile({
  doc,
  depth,
  isActive,
  onClick,
}: {
  doc: DocNode;
  depth: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 6,
        width: "100%",
        padding: "3px 8px 3px 0",
        paddingLeft: 8 + depth * INDENT_PX,
        border: "none",
        borderRadius: 4,
        fontSize: 13,
        fontWeight: isActive ? 500 : 400,
        fontFamily: "inherit",
        color: isActive ? "var(--text-primary)" : hovered ? "var(--text-secondary)" : "var(--text-muted)",
        background: isActive ? "var(--surface-alt)" : hovered ? "var(--surface-hover)" : "transparent",
        cursor: "pointer",
        textAlign: "left",
        transition: "color 0.12s, background 0.12s",
        lineHeight: "22px",
        minHeight: 26,
      }}
    >
      <IndentGuides depth={depth} />
      {isActive && <span className="nav-item-active-bar" />}
      <span style={{ color: doc.source_type === "url" ? "var(--text-link)" : "var(--text-faint)", flexShrink: 0, display: "flex" }}>
        {doc.source_type === "url" ? <IconGlobe /> : <IconFile />}
      </span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {doc.title || doc.filename}
      </span>
    </button>
  );
}

// ── TreeFolder ────────────────────────────────────────────────────

function TreeFolder({
  folder,
  depth,
  expanded,
  onToggle,
  activeDocId,
  onFileClick,
  expandedSet,
  onToggleFolder,
}: {
  folder: FolderNode;
  depth: number;
  expanded: boolean;
  onToggle: () => void;
  activeDocId: string | null;
  onFileClick: (docId: string) => void;
  expandedSet: Set<string>;
  onToggleFolder: (path: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div>
      <button
        onClick={onToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 5,
          width: "100%",
          padding: "3px 8px 3px 0",
          paddingLeft: 8 + depth * INDENT_PX,
          border: "none",
          borderRadius: 4,
          fontSize: 13,
          fontWeight: 500,
          fontFamily: "inherit",
          color: hovered ? "var(--text-primary)" : "var(--text-secondary)",
          background: hovered ? "var(--surface-hover)" : "transparent",
          cursor: "pointer",
          textAlign: "left",
          transition: "color 0.12s, background 0.12s",
          lineHeight: "22px",
          minHeight: 26,
        }}
      >
        <IndentGuides depth={depth} />
        <span style={{ color: "var(--text-faint)", display: "flex" }}>
          <IconChevron expanded={expanded} />
        </span>
        <span style={{ color: "var(--text-faint)", display: "flex", flexShrink: 0 }}>
          {expanded ? <IconFolderOpen /> : <IconFolderClosed />}
        </span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {folder.name}
        </span>
        {folder.document_count > 0 && (
          <span style={{
            flexShrink: 0,
            fontSize: 10,
            color: "var(--text-faint)",
            letterSpacing: "0.3px",
            fontVariantNumeric: "tabular-nums",
            fontWeight: 400,
          }}>
            {folder.document_count}
          </span>
        )}
      </button>

      {expanded && (
        <div>
          {/* Sub-folders first */}
          {folder.children.map((child) => (
            <TreeFolder
              key={child.path}
              folder={child}
              depth={depth + 1}
              expanded={expandedSet.has(child.path)}
              onToggle={() => onToggleFolder(child.path)}
              activeDocId={activeDocId}
              onFileClick={onFileClick}
              expandedSet={expandedSet}
              onToggleFolder={onToggleFolder}
            />
          ))}
          {/* Files */}
          {folder.documents.map((doc) => (
            <TreeFile
              key={doc.id}
              doc={doc}
              depth={depth + 1}
              isActive={activeDocId === doc.id}
              onClick={() => onFileClick(doc.id)}
            />
          ))}
          {/* Empty folder hint */}
          {folder.children.length === 0 && folder.documents.length === 0 && (
            <div style={{
              paddingLeft: 8 + (depth + 1) * INDENT_PX,
              fontSize: 12,
              color: "var(--text-faint)",
              fontStyle: "italic",
              lineHeight: "24px",
              opacity: 0.7,
            }}>
              empty
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── FileTree (main export) ────────────────────────────────────────

export default function FileTree({ tree, activeDocId, onFileClick }: FileTreeProps) {
  const [expandedSet, setExpandedSet] = useState<Set<string>>(loadExpanded);

  // Persist expand state
  useEffect(() => {
    saveExpanded(expandedSet);
  }, [expandedSet]);

  const toggleFolder = useCallback((path: string) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  if (tree.length === 0) {
    return (
      <div style={{
        padding: "8px 14px",
        fontSize: 12,
        color: "var(--text-faint)",
        fontStyle: "italic",
      }}>
        No folders yet
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {tree.map((folder) => (
        <TreeFolder
          key={folder.path}
          folder={folder}
          depth={0}
          expanded={expandedSet.has(folder.path)}
          onToggle={() => toggleFolder(folder.path)}
          activeDocId={activeDocId}
          onFileClick={onFileClick}
          expandedSet={expandedSet}
          onToggleFolder={toggleFolder}
        />
      ))}
    </div>
  );
}
