# LAIDocs Phase 3 Walkthrough: Pipeline and Packaging

The Document Intelligence Pipeline (Phase 2) and Polish & Packaging (Phase 3) have been fully implemented.

## 1. Tauri Dev Environment Fixes
The previous session ended with an issue where running `tauri dev` resulted in a black screen. This was caused by the following:
* **Working Directory Mismatch**: The Rust sidecar spawner was trying to go up two directory levels to find the project root. During `tauri dev`, the current working directory is *already* the project root, so this resulted in an invalid path and the Python backend failed to start.
* **Port Mismatch**: The Rust frontend health checker (`ping_sidecar`) was checking port `8000`, while the backend was bound to `8008`.

Both issues have been fixed in `src-tauri/src/main.rs`. We also switched the before-dev commands to use `npm` instead of `pnpm` to ensure maximum environment compatibility. The development server (`npm run tauri dev`) now successfully spawns the Python sidecar and connects the frontend.

## 2. PyInstaller Packaging
We implemented a robust packaging strategy for the FastAPI sidecar so it can be shipped alongside the Tauri Electron shell as a single application:

1. **Build Script (`build_sidecar.py`)**: A new Python script was created at the project root. It uses PyInstaller to compile the entire `backend` into a single standalone binary.
2. **Hidden Imports**: All dynamically loaded ML dependencies (`lancedb`, `markitdown`, `sentence_transformers`, `sqlite_vec`) were explicitly included to ensure the bundled binary contains everything needed to run RAG.
3. **Tauri Integration**: The compiled binary is automatically renamed with the correct Rust target triple (e.g., `main-x86_64-unknown-linux-gnu`) and placed inside `src-tauri/bin/api/`.
4. **Configuration**: `tauri.conf.json` was updated with `"externalBin": ["bin/api/main"]` to instruct the Tauri bundler to include the compiled binary during the production build step.

## 3. Ready for Production Build
The project is fully complete according to the `task.md` tracker!

To generate the final executable for your platform, you can now run:
```bash
python3 build_sidecar.py
npm run tauri build
```
This will yield a standalone installer (e.g., `.AppImage` or `.deb` on Linux, `.exe` on Windows) containing both the React UI and the bundled Python ML backend.
