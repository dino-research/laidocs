# tests/test_vault_assets.py
from pathlib import Path
import sys
import importlib


def test_ensure_assets_dir_creates_folder(tmp_path):
    """ensure_assets_dir() creates the assets directory and returns its path."""
    # Import the real vault module (not the singleton)
    # Force re-import so we get the module, not the VaultManager singleton
    if "backend.core.vault" in sys.modules:
        vault_mod = sys.modules["backend.core.vault"]
    else:
        vault_mod = importlib.import_module("backend.core.vault")

    # Patch module-level ASSETS_DIR to point to tmp_path
    original_assets_dir = vault_mod.ASSETS_DIR
    vault_mod.ASSETS_DIR = tmp_path / "assets"
    try:
        result = vault_mod.ensure_assets_dir()
        assert result.is_dir()
        assert result.name == "assets"
        assert result == tmp_path / "assets"
    finally:
        vault_mod.ASSETS_DIR = original_assets_dir
