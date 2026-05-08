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
