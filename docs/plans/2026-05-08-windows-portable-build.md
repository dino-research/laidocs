# Windows Portable Build Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Create a robust automated script to cross-compile the Tauri app and its Python sidecar from Linux to a Windows standalone portable executable.

**Architecture:** Use Docker (`tobix/pywine`) to provide a clean Wine+Windows Python environment for packaging the Python backend with PyInstaller. Then use MinGW-w64 on the host Linux system to cross-compile the Rust/Tauri frontend. Wrap everything in bash scripts.

**Tech Stack:** Docker, Wine, PyInstaller, MinGW-w64, Rust, Tauri.

---

### Task 1: Create Backend Windows Build Script

**Files:**
- Create: `scripts/build_windows_sidecar.sh`

**Step 1: Write the script**

```bash
#!/bin/bash
# scripts/build_windows_sidecar.sh
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="tobix/pywine:3.12"

echo "Building backend for Windows using Docker ($IMAGE)..."
docker run --rm -v "$ROOT_DIR/backend:/workspace" -w /workspace "$IMAGE" bash -c "\
    wine python -m pip install -r requirements.txt && \
    wine python -m PyInstaller --name main --onefile --clean --noconfirm \
    --hidden-import docling --hidden-import docling_core \
    --hidden-import pydantic --hidden-import lancedb --hidden-import uvicorn \
    main.py"

echo "Copying binary to src-tauri/bin/api/..."
mkdir -p "$ROOT_DIR/src-tauri/bin/api"
cp "$ROOT_DIR/backend/dist/main.exe" "$ROOT_DIR/src-tauri/bin/api/main-x86_64-pc-windows-gnu.exe"
echo "Backend Windows sidecar built successfully!"
```

**Step 2: Make it executable**

Run: `chmod +x scripts/build_windows_sidecar.sh`
Expected: File becomes executable.

**Step 3: Commit**

```bash
git add scripts/build_windows_sidecar.sh
git commit -m "feat: add docker-based windows build script for python sidecar"
```

---

### Task 2: Create Main Cross-Compilation Script

**Files:**
- Create: `scripts/build_windows_portable.sh`

**Step 1: Write the script**

```bash
#!/bin/bash
# scripts/build_windows_portable.sh
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Checking for MinGW-w64..."
if ! command -v x86_64-w64-mingw32-gcc &> /dev/null; then
    echo "ERROR: MinGW-w64 is required."
    echo "Please install it using: sudo apt-get install mingw-w64"
    exit 1
fi

echo "Adding rust target x86_64-pc-windows-gnu..."
rustup target add x86_64-pc-windows-gnu

echo "--- STEP 1: Building Windows Sidecar ---"
bash "$ROOT_DIR/scripts/build_windows_sidecar.sh"

echo "--- STEP 2: Building Tauri App for Windows ---"
cd "$ROOT_DIR"
pnpm tauri build --target x86_64-pc-windows-gnu

echo "Build complete! Check src-tauri/target/x86_64-pc-windows-gnu/release/bundle/"
```

**Step 2: Make it executable**

Run: `chmod +x scripts/build_windows_portable.sh`
Expected: File becomes executable.

**Step 3: Commit**

```bash
git add scripts/build_windows_portable.sh
git commit -m "feat: add main windows cross-compilation script"
```
