# UIW React MD Editor Integration Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Integrate `@uiw/react-md-editor` into the Document Editor to replace the custom textarea and preview pane, enabling synchronous scrolling and a rich markdown editing experience.

**Architecture:** We will install the `@uiw/react-md-editor` package. In `src/pages/DocumentEditor.tsx`, we will replace the custom `<textarea>` and `<MarkdownPreview>` with the `<MDEditor>` component. The existing `content` state and debounced auto-save mechanism will remain intact and be wired into the new editor.

**Tech Stack:** React, `@uiw/react-md-editor`, Vite

---
### Task 1: Add Dependencies

**Files:**
- Modify: `package.json` (via command line)

**Step 1: Install `@uiw/react-md-editor`**

Run: `pnpm add @uiw/react-md-editor`
Expected: Installation completes successfully.

---
### Task 2: Implement UIW MD Editor in DocumentEditor

**Files:**
- Modify: `src/pages/DocumentEditor.tsx`

**Step 1: Import and Replace Components**

Import `MDEditor` and replace the existing split-pane custom layout with `<MDEditor>` inside `DocumentEditor.tsx`. Ensure the `value` and `onChange` props are wired correctly to existing state. Remove unused `textareaRef`, `handleKeyDown`, etc.

**Step 2: Run build to verify it passes**

Run: `pnpm tsc`
Expected: PASS with no TypeScript errors.

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml src/pages/DocumentEditor.tsx
git commit -m "feat: replace custom markdown editor with @uiw/react-md-editor for sync scrolling"
```
