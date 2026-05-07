# Export/Import Data — Design Document

## Overview

LAIDocs is a fully local application. Users need to export their data for backup purposes and import it back when switching machines. This feature provides a complete data backup/restore mechanism accessible from the Settings page.

## Scope

### Included in Export
- **Vault filesystem** — All folders, `.md` documents, `.meta.json` metadata files, `assets/` directory (extracted images)
- **SQLite database** — `laidocs.db` containing documents metadata, tree_index, chat_messages

### Excluded from Export
- **LLM config** (`config.json`) — Contains sensitive API keys, is machine-specific

## Archive Format

File extension: `.laidocs-backup` (internally a zip archive)

### Internal Structure
```
manifest.json
vault/
  unsorted/
    document.md
    document.md.meta.json
  folder-name/
    ...
  assets/
    image-uuid.png
    ...
data/
  laidocs.db
```

### manifest.json
```json
{
  "format_version": 1,
  "app_version": "1.0.0",
  "created_at": "2026-05-08T04:25:00Z",
  "stats": {
    "folders": 5,
    "documents": 23,
    "chat_messages": 147
  }
}
```

The `format_version` field enables forward-compatible schema migrations when the app evolves.

## Architecture — Hybrid

| Layer | Responsibility |
|---|---|
| **Frontend (React)** | UI buttons in Settings page, call Tauri dialog APIs, call backend API, display progress/results |
| **Tauri (JS API)** | Native file picker via `dialog.save()` / `dialog.open()` |
| **Backend (Python FastAPI)** | Zip/unzip operations, manifest creation/validation, data merge logic, stats queries |

## Backend API

### `POST /api/backup/export`
**Request:** `{ "target_path": "/path/to/file.laidocs-backup" }`
**Response:** `{ "success": true, "file_size": 1048576, "stats": { ... } }`
**Behavior:** Creates a zip archive at the specified path containing vault directory and database file, with a generated manifest.json.

### `POST /api/backup/preview`
**Request:** `{ "source_path": "/path/to/file.laidocs-backup" }`
**Response:** `{ "manifest": { ... }, "valid": true }`
**Behavior:** Reads and validates the manifest from a backup file without modifying any data. Returns stats for user review before import.

### `POST /api/backup/import`
**Request:** `{ "source_path": "/path/to/file.laidocs-backup", "mode": "replace" | "merge" }`
**Response:** `{ "success": true, "imported": { "folders": 5, "documents": 23 } }`
**Behavior:** Imports data from backup file using the specified mode.

## Import Modes

### Replace
1. Close database connections
2. Delete existing vault directory contents
3. Delete existing database
4. Extract backup vault to `~/.laidocs/vault/`
5. Extract backup database to `~/.laidocs/data/laidocs.db`
6. Reinitialize database connections
7. Signal frontend to refresh all state

### Merge
1. Extract backup to a temporary directory
2. Walk backup vault folders — create any that don't exist locally
3. Walk backup documents — for each document:
   - If `doc_id` already exists locally → skip
   - If `doc_id` is new → copy `.md` + `.meta.json` to local vault
4. Walk backup assets — copy any missing asset files
5. Merge database records:
   - Documents table: INSERT OR IGNORE by `id`
   - Chat messages: INSERT messages for newly imported documents only
   - Tree index: Copy for newly imported documents only
6. Clean up temporary directory

## UI Design

### Settings Page — New "Data" Tab

Add a third tab to the existing Settings page tab bar:

```
[LLM]  [Data]  [Release Notes]
```

### Data Tab Content

**Current Data Stats Section:**
- Display current vault stats: folder count, document count, total chat messages

**Export Section:**
- Description text explaining what gets exported
- "Export Data" button (pill style, consistent with design system)
- On click: Tauri save dialog → backend export → success toast with file size

**Import Section:**
- Description text explaining import behavior
- "Import Data" button
- On click: Tauri open dialog → backend preview → confirmation dialog → import → success toast

### Export Flow
```
Click "Export Data"
  → Tauri save dialog (default: laidocs-backup-YYYY-MM-DD.laidocs-backup)
  → Show progress indicator on button
  → POST /api/backup/export with chosen path
  → Success toast: "Backup saved (X.X MB)"
  → Error toast if failure
```

### Import Flow
```
Click "Import Data"
  → Tauri open dialog (filter: *.laidocs-backup)
  → POST /api/backup/preview with chosen path
  → Show preview dialog:
      "This backup contains X documents, Y folders, Z chat messages"
      "Created on: 2026-05-08"
      [Replace All] [Merge] [Cancel]
  → If "Replace All": confirm warning dialog
      "⚠️ This will delete all current data. This action cannot be undone."
      [Confirm Replace] [Cancel]
  → Show progress indicator
  → POST /api/backup/import with path + mode
  → Success toast: "Imported X documents"
  → Auto-refresh sidebar and app state
```

## Error Handling

| Scenario | Behavior |
|---|---|
| Invalid/corrupt backup file | Preview endpoint returns `{ "valid": false, "error": "..." }`, UI shows error |
| Incompatible format_version | Preview warns user, blocks import if version too new |
| Disk full during export | Backend catches IOError, returns error, UI shows toast |
| Import fails mid-way (Replace mode) | Backup current data to temp before replacing, rollback on failure |
| File permission denied | Backend returns 403-like error, UI shows descriptive message |

## Version Compatibility

- `format_version: 1` — initial schema
- Future versions increment `format_version`
- Import logic checks version: same or older → proceed; newer → warn/block
- Migrations can be added per version bump (e.g., schema changes to DB)
