import os
import subprocess
import shutil
import sys
from pathlib import Path

def get_target_triple():
    # Run rustc -vV to get the host target triple
    result = subprocess.run(['rustc', '-vV'], capture_output=True, text=True)
    for line in result.stdout.splitlines():
        if line.startswith('host:'):
            return line.split(' ')[1].strip()
    
    # Fallback if rustc fails
    if sys.platform == "darwin":
        import platform
        if platform.machine() == "arm64":
            return "aarch64-apple-darwin"
        else:
            return "x86_64-apple-darwin"
    elif sys.platform == "win32":
        return "x86_64-pc-windows-msvc"
    else:
        return "x86_64-unknown-linux-gnu"

def main():
    root_dir = Path(__file__).parent.resolve()
    backend_dir = root_dir / "backend"
    tauri_bin_dir = root_dir / "src-tauri" / "bin" / "api"
    
    # Ensure bin directory exists
    tauri_bin_dir.mkdir(parents=True, exist_ok=True)
    
    print("Building backend with PyInstaller...")
    # Change to backend directory
    os.chdir(backend_dir)
    
    # Determine the python executable inside the venv
    venv_python = backend_dir / ".venv" / "bin" / "python"
    if not venv_python.exists():
        # Fallback for Windows
        venv_python = backend_dir / ".venv" / "Scripts" / "python.exe"
    if not venv_python.exists():
        print("Virtual environment not found. Please setup the .venv first.")
        sys.exit(1)
        
    pyinstaller_cmd = [
        str(venv_python), "-m", "PyInstaller",
        "--name", "main",
        "--onefile",
        "--clean",
        "--noconfirm",
        # Explicitly add dependencies that might be missed by PyInstaller analysis
        "--hidden-import", "markitdown",
        "--hidden-import", "pydantic",
        "--hidden-import", "lancedb",
        "--hidden-import", "uvicorn",
        "main.py"
    ]
    
    subprocess.run(pyinstaller_cmd, check=True)
    
    # Determine the output binary name
    target_triple = get_target_triple()
    bin_name = "main.exe" if sys.platform == "win32" else "main"
    dest_name = f"main-{target_triple}.exe" if sys.platform == "win32" else f"main-{target_triple}"
    
    src_bin = backend_dir / "dist" / bin_name
    dest_bin = tauri_bin_dir / dest_name
    
    print(f"Copying {src_bin} to {dest_bin}...")
    shutil.copy2(src_bin, dest_bin)
    
    print("Done! Sidecar binary is ready for Tauri packaging.")

if __name__ == "__main__":
    main()
