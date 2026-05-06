# Sidebar UI/UX and File Explorer Refinement

## Overview
This design outlines the improvements for the File Explorer and Sidebar UI/UX, incorporating an IDE-style Context Menu for file/folder operations, refining the typography, and improving interaction sizing. The design follows the "Data-Dense Dashboard" aesthetic.

## Architecture & Components
1. **Context Menu (`FileTree.tsx`)**:
   - Implemented via an absolute positioned `div` rendered at `(mouseX, mouseY)` upon triggering `onContextMenu` on a `TreeFile` or `TreeFolder`.
   - The menu tracks the active target `{ type: 'file' | 'folder', id/path, name }`.
   - Clicking outside the context menu or pressing Escape will dismiss it.

2. **Inline Rename (`FileTree.tsx`)**:
   - Replaces the generic target node with an `<input>` component initialized with the current name.
   - Saves changes on `Enter` or loss of focus (`onBlur`).
   - Cancels on `Escape`.
   - Integrates with backend via PUT requests.

3. **Sidebar UI Refinement (`Sidebar.tsx`)**:
   - Increases the "Create File" and "Create Folder" buttons from `20x20` to `26x26` pixels.
   - Enhances SVGs by tweaking `strokeWidth` and padding to create a visually accessible target.
   - Uses interactive hover states `bg-surface-alt` or similar CSS variables for visual feedback.

4. **Markdown Typography (`bytemd-theme.css`)**:
   - Refines fonts for the ByteMD editor.
   - **Body/Sans-serif**: `Fira Sans` for UI labels, lists, and standard text.
   - **Monospace/Code**: `Fira Code` for code blocks and inline code.

## Data Flow & API Updates
1. **Folders**:
   - Rename: Existing `PUT /api/folders/rename`.
   - Delete: Existing `DELETE /api/folders/{path}`.
   
2. **Documents**:
   - Rename: Modifying `PUT /api/documents/{doc_id}` to optionally accept and update `title` and `filename` attributes.
   - Delete: Existing `DELETE /api/documents/{doc_id}`.

## Error Handling
- Inline error messages or UI toasts if a rename action fails (e.g., duplicated name or invalid characters).
- Window `confirm` or custom modal before permanently deleting folders/files to prevent accidental data loss.
