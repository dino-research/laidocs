# IDE-Style File Tree Sidebar Redesign

## Overview

Redesign the application's folder/document navigation from a flat folder list + document grid cards to a VS Code-inspired file tree sidebar with resizable panels, nested folder support, and document management capabilities.

## Goals

- Replace flat folder list with collapsible, nested file tree (2-3 levels)
- Remove the Documents grid page; main area shows editor or "Select a document" placeholder
- Add resizable sidebar with drag handle and collapse toggle
- Enable creating empty `.md` files directly from the sidebar
- Enable downloading `.md` files from the editor toolbar

---

## Design Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Folder nesting depth | 2-3 levels max |
| 2 | Opening documents | Navigate to `/doc/:id` (existing behavior) |
| 3 | Home page (main area) | Remove grid → "Select a document" placeholder |
| 4 | Sidebar resize | Drag handle + collapse/expand toggle |
| 5 | Creating .md files | Icon buttons on EXPLORER section header |
| 6 | Downloading .md | Download button in editor toolbar |

---

## Architecture

### Layout Structure

```
┌──────────────────────────────────────────────────────────┐
│  App Shell (100vh)                                       │
│  ┌─────────────┬───┬──────────────────────────────────┐  │
│  │  Sidebar     │ ┃ │  Main Content Area               │  │
│  │  (resizable) │ ┃ │                                   │  │
│  │              │ ┃ │  Route: /        → WelcomePanel   │  │
│  │  ┌─────────┐ │ ┃ │  Route: /doc/:id → DocumentEditor │  │
│  │  │ Brand   │ │ ┃ │  Route: /search  → Search         │  │
│  │  ├─────────┤ │ ┃ │  Route: /settings→ Settings       │  │
│  │  │EXPLORER │ │ ┃ │                                   │  │
│  │  │ 📁 docs │ │ ┃ │                                   │  │
│  │  │  📄 a.md│ │ ┃ │                                   │  │
│  │  │  📁 api │ │ ┃ │                                   │  │
│  │  │   📄b.md│ │ ┃ │                                   │  │
│  │  │ 📁 notes│ │ ┃ │                                   │  │
│  │  │  📄 c.md│ │ ┃ │                                   │  │
│  │  ├─────────┤ │ ┃ │                                   │  │
│  │  │ Search  │ │ ┃ │                                   │  │
│  │  │ Upload  │ │ ┃ │                                   │  │
│  │  │ Crawl   │ │ ┃ │                                   │  │
│  │  ├─────────┤ │ ┃ │                                   │  │
│  │  │Settings │ │ ┃ │                                   │  │
│  │  └─────────┘ │ ┃ │                                   │  │
│  └──────────────┴───┴──────────────────────────────────┘  │
│                  ↑                                        │
│            Drag handle (3px)                              │
└──────────────────────────────────────────────────────────┘
```

### Sidebar Sections (top to bottom)

1. **Brand header** — LAIDocs logo + name (existing, keep)
2. **EXPLORER section** — file tree with nested folders/documents
   - Section header: "EXPLORER" label + [New File] [New Folder] icon buttons
   - Tree view: folders (collapsible) → sub-folders → documents (.md files)
   - Each tree item: indent + chevron (folders) + icon + name
   - Indent: 20px per level
3. **Quick Actions** — Search, Upload, Crawl URL buttons
4. **Footer** — Settings + Reload (existing, keep)

### Collapsed Sidebar State

When collapsed via toggle button:
- Sidebar width → 0px (fully hidden)
- A small toggle button (≡ or `>>`) remains visible at the left edge of the main area
- Click to expand back to previous width

---

## Component Design

### 1. ResizableSidebar

**New wrapper component** that manages:
- `width` state (default: 260px, min: 180px, max: 400px)
- `collapsed` state (boolean)
- Drag handle on right edge
- Collapse toggle button

```
Props: none (manages own state via local state or context)
State:
  - width: number (persisted to localStorage)
  - collapsed: boolean (persisted to localStorage)
  - isDragging: boolean
```

**Drag behavior:**
- `onMouseDown` on handle → start tracking
- `onMouseMove` on document → update width (clamped to min/max)
- `onMouseUp` → stop tracking
- Cursor changes to `col-resize` during drag
- Handle highlights on hover (subtle border color change)

### 2. FileTree

**New component** replacing the current folder list in Sidebar.

```
Props:
  - folders: TreeNode[]      // nested folder structure from API
  - documents: DocNode[]     // flat list, grouped by folder
  - onFileClick: (docId) => void
  - onCreateFile: (folderPath) => void
  - onCreateFolder: (parentPath) => void

TreeNode:
  - path: string
  - name: string
  - parent_path: string | null
  - children: TreeNode[]     // sub-folders
  - documents: DocNode[]     // files in this folder
  - isExpanded: boolean

DocNode:
  - id: string
  - title: string
  - filename: string
  - folder: string
```

**Tree item rendering:**
- **Folder:** `[chevron ▶/▼] [📁] folder-name`  — click toggles expand/collapse
- **File:** `[   ] [📄] filename.md` — click navigates to `/doc/:id`
- Active file highlighted (matches current route `/doc/:id`)
- Hover: subtle background highlight
- Indent: `paddingLeft = depth * 20px`

**Expand/collapse state:** stored in component state (Map<string, boolean>), persisted to localStorage.

### 3. WelcomePanel

**New component** replacing the Documents grid page at route `/`.

Visual design:
```
┌─────────────────────────────────────────┐
│                                         │
│                                         │
│            [📄 icon, 48px]              │
│                                         │
│        Select a document                │
│                                         │
│   Choose a file from the sidebar        │
│   or create a new one to get started    │
│                                         │
│     [Upload]  [Crawl URL]  [New File]   │
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

- Centered vertically and horizontally
- Warm, muted styling consistent with DESIGN.md
- Quick action buttons for discoverability

### 4. Editor Toolbar Enhancement

Add download button to existing DocumentEditor toolbar:

```
[← Back] | Title | [Source badge] | --- spacer --- | Status | [⬇ Download] | [💬 Chat] | [🗑 Delete]
```

Download behavior:
- Creates a Blob from current markdown content
- Triggers browser download with filename from document metadata
- Uses `document.createElement('a')` + `URL.createObjectURL` pattern

### 5. Create Empty .md File

**Workflow:**
1. User clicks [New File] icon in EXPLORER header
2. Inline input appears at top of tree (or inside currently selected/expanded folder)
3. User types filename (auto-append `.md` if not present)
4. Press Enter → API call: `POST /api/documents/create` with empty content
5. New file appears in tree, automatically opened in editor

**New API endpoint:**
```
POST /api/documents/create
Body: { filename: string, folder: string, title?: string }
Response: { id, title, folder, filename }
```

This creates a `.md` file with empty content and saves metadata.

---

## Backend Changes

### API: `POST /api/documents/create`

New endpoint to create an empty document:
- Generates UUID for doc_id
- Calls `vault.save_document()` with empty content
- Inserts into SQLite
- Returns document metadata

### API: `GET /api/folders/tree`

Enhanced endpoint returning nested tree structure:
- Returns folders with their documents nested inside
- Includes document metadata (id, title, filename) for each file
- Sorted: folders first, then files, both alphabetically

Response shape:
```json
[
  {
    "path": "docs",
    "name": "docs",
    "children": [
      {
        "path": "docs/api",
        "name": "api",
        "children": [],
        "documents": [
          { "id": "abc123", "title": "API Reference", "filename": "api-ref.md" }
        ]
      }
    ],
    "documents": [
      { "id": "def456", "title": "Getting Started", "filename": "getting-started.md" }
    ]
  }
]
```

### Folder Creation Enhancement

Update `POST /api/folders/` to properly handle nested paths:
- Accept `parent_path` in request body
- Create intermediate directories if needed
- Validate depth ≤ 3 levels

---

## Data Flow

### Loading the File Tree

```
App mounts
  → Sidebar renders
    → FileTree component mounts
      → GET /api/folders/tree
      → Build tree state from response
      → Restore expand/collapse state from localStorage
      → Render tree
```

### Creating a New File

```
User clicks [New File] icon
  → Inline input appears in tree
  → User types "my-notes" + Enter
  → POST /api/documents/create { filename: "my-notes.md", folder: selectedFolder }
  → Response: { id: "xyz", ... }
  → Refresh tree
  → Navigate to /doc/xyz
```

### Resizing Sidebar

```
User mousedown on drag handle
  → isDragging = true
  → document mousemove: update width (clamped 180-400px)
  → document mouseup: isDragging = false, save width to localStorage
```

---

## Styling

All new components follow the existing DESIGN.md (Warp-inspired warm dark theme):

- **Tree item text:** `var(--text-muted)` default, `var(--text-primary)` when active
- **Tree item hover:** `var(--surface-hover)` background
- **Tree item active:** `var(--surface-alt)` background + left accent bar
- **Chevron:** `var(--text-faint)`, rotates 90° on expand
- **Drag handle:** `var(--border)` default, `var(--border-strong)` on hover
- **Section label:** `label-upper` class (uppercase, letter-spacing)
- **Indent guides:** subtle 1px `var(--border)` vertical lines at each indent level

---

## Files Affected

### New Files
- `src/components/FileTree.tsx` — tree view component
- `src/components/ResizableSidebar.tsx` — resizable wrapper
- `src/pages/WelcomePanel.tsx` — "Select a document" placeholder

### Modified Files
- `src/components/Layout.tsx` — use ResizableSidebar wrapper
- `src/components/Sidebar.tsx` — replace folder list with FileTree, add new file/folder icons
- `src/pages/DocumentEditor.tsx` — add download button to toolbar
- `src/App.tsx` — update route `/` to render WelcomePanel instead of Documents
- `src/context/FolderContext.tsx` — may need tree-aware state
- `backend/api/folders.py` — add `GET /api/folders/tree` endpoint
- `backend/api/documents.py` — add `POST /api/documents/create` endpoint

### Removed/Deprecated
- `src/pages/Documents.tsx` — no longer needed (may keep for reference initially)

---

## Out of Scope (Future)

- Right-click context menu on tree items
- Drag-and-drop to move files between folders
- File rename inline in tree
- Multi-select files
- Tabs for multiple open documents
- Folder nesting beyond 3 levels
