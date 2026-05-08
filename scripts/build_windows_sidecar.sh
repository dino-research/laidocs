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
