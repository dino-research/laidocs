"""LAIDocs core — configuration, database, and vault."""

from backend.core.config import Settings, get_settings, reload_settings
from backend.core.database import DB_PATH, db_dependency, get_db, init_db
from backend.core.vault import VAULT_DIR, DocumentMeta, VaultManager, vault

__all__ = [
    "Settings",
    "get_settings",
    "reload_settings",
    "DB_PATH",
    "db_dependency",
    "get_db",
    "init_db",
    "VAULT_DIR",
    "DocumentMeta",
    "VaultManager",
    "vault",
]
