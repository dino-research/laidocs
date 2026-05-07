# Export/Import Data Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Allow users to export all local data as a `.laidocs-backup` file and import it back on another machine.

**Architecture:** Hybrid — Tauri dialog for native file picker, Python backend for zip/unzip/validation. New "Data" tab in Settings page.

**Tech Stack:** Python zipfile + FastAPI endpoints, Tauri dialog plugin (`@tauri-apps/plugin-dialog`), React UI

**Design doc:** `docs/plans/2026-05-08-export-import-data-design.md`

---

### Task 1: Install Tauri Dialog Plugin

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `src-tauri/src/lib.rs` (register plugin)

**Step 1: Install npm package**

```bash
pnpm add @tauri-apps/plugin-dialog
```

**Step 2: Add Rust dependency**

```bash
cd src-tauri && cargo add tauri-plugin-dialog
```

**Step 3: Register plugin in Rust main/lib**

Add `.plugin(tauri_plugin_dialog::init())` to the Tauri builder.

**Step 4: Add permissions**

In `src-tauri/capabilities/default.json`, add `"dialog:default"` to permissions array.

**Step 5: Commit**

```bash
git add -A && git commit -m "chore: install tauri dialog plugin"
```

---

### Task 2: Backend — Backup Service

**Files:**
- Create: `backend/services/backup.py`

**Step 1: Create backup service**

Implement these functions:

- `get_vault_stats()` → returns `{folders, documents, chat_messages}` counts
- `export_backup(target_path)` → creates zip at path with manifest.json + vault/ + data/laidocs.db
- `preview_backup(source_path)` → reads manifest from zip, validates format_version
- `import_backup(source_path, mode)` → dispatches to replace or merge
- `_import_replace(source)` → clears vault + db, extracts backup, reinits db
- `_import_merge(source)` → skips existing doc_ids, copies new docs/assets, merges db records

Key details:
- `manifest.json` contains `format_version: 1`, `app_version`, `created_at`, `stats`
- Merge uses `doc_id` from `.meta.json` as dedup key
- After replace, ensure `unsorted` folder exists and call `init_db()`
- Merge DB: INSERT OR IGNORE documents, only insert chat_messages for new doc_ids

**Step 2: Commit**

```bash
git add backend/services/backup.py && git commit -m "feat: add backup service for export/import"
```

---

### Task 3: Backend — Backup API Router

**Files:**
- Create: `backend/api/backup.py`
- Modify: `backend/api/__init__.py`
- Modify: `backend/main.py`

**Step 1: Create API router** (`backend/api/backup.py`)

Endpoints:
- `GET /api/backup/stats` → calls `get_vault_stats()`
- `POST /api/backup/export` body: `{target_path}` → calls `export_backup()`
- `POST /api/backup/preview` body: `{source_path}` → calls `preview_backup()`
- `POST /api/backup/import` body: `{source_path, mode}` → calls `import_backup()`

**Step 2: Register router**

In `backend/api/__init__.py`: add `from .backup import router as backup_router`
In `backend/main.py`: add `app.include_router(backup_router)`

**Step 3: Commit**

```bash
git add backend/api/backup.py backend/api/__init__.py backend/main.py
git commit -m "feat: add backup API endpoints"
```

---

### Task 4: Frontend — Data Tab in Settings

**Files:**
- Modify: `src/pages/Settings.tsx`

**Step 1: Add Data tab**

1. Add `"data"` to `Tab` type: `type Tab = "llm" | "data" | "release_notes"`
2. Add Data tab icon (database/archive SVG) and entry to `tabs` array
3. Add Data tab content with three cards:

**Stats Card:**
- Fetch from `GET /api/backup/stats` on tab mount
- Display: X folders, Y documents, Z chat messages

**Export Card:**
- Description: "Create a complete backup of your documents, folders, and chat history."
- "Export Data" button
- Click flow: Tauri `save()` dialog (filter: `.laidocs-backup`, default name with date) → `POST /api/backup/export` → success/error toast

**Import Card:**
- Description: "Restore data from a previously exported backup file."
- "Import Data" button
- Click flow: Tauri `open()` dialog (filter: `.laidocs-backup`) → `POST /api/backup/preview` → show preview modal → user picks Replace/Merge → confirm warning for Replace → `POST /api/backup/import` → success toast → reload page

4. Dev mode fallback: when not in Tauri, use `<input type="file">` or show message that dialog requires Tauri.

**Step 2: Commit**

```bash
git add src/pages/Settings.tsx && git commit -m "feat: add Data tab with export/import UI"
```

---

### Task 5: End-to-End Testing

**Step 1:** Test export — verify save dialog, file created, valid zip
**Step 2:** Test preview — verify stats shown correctly
**Step 3:** Test replace import — verify data fully replaced
**Step 4:** Test merge import — verify dedup works, new docs added
**Step 5:** Final commit

```bash
git add -A && git commit -m "feat: export/import data feature complete"
```
