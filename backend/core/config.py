"""LAIDocs configuration management using pydantic-settings with JSON persistence."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from pydantic import BaseModel
from pydantic_settings import BaseSettings

LAIDOCS_HOME = Path.home() / ".laidocs"
CONFIG_PATH = LAIDOCS_HOME / "config.json"


class LLMConfig(BaseModel):
    base_url: str = ""
    api_key: str = ""
    model: str = ""


class EmbeddingConfig(BaseModel):
    base_url: str = ""
    api_key: str = ""
    model: str = ""


class RerankerConfig(BaseModel):
    base_url: str = ""
    api_key: str = ""
    model: str = ""
    enabled: bool = False


class Settings(BaseSettings):
    """LAIDocs application settings persisted to ~/.laidocs/config.json."""

    llm: LLMConfig = LLMConfig()
    embedding: EmbeddingConfig = EmbeddingConfig()
    reranker: RerankerConfig = RerankerConfig()
    port: int = 8008

    model_config = {"arbitrary_types_allowed": True}

    # ── persistence ──────────────────────────────────────────────────

    def save_to_file(self, path: Path | None = None) -> None:
        """Write current settings as JSON to *path* (default CONFIG_PATH)."""
        target = path or CONFIG_PATH
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(self.model_dump_json(indent=2), encoding="utf-8")

    @classmethod
    def load_from_file(cls, path: Path | None = None) -> Settings:
        """Read settings from *path* (default CONFIG_PATH). Missing file → defaults."""
        target = path or CONFIG_PATH
        if not target.exists():
            # Ensure the directory exists
            target.parent.mkdir(parents=True, exist_ok=True)
            return cls()
        try:
            raw = json.loads(target.read_text(encoding="utf-8"))
            return cls.model_validate(raw)
        except (json.JSONDecodeError, Exception):
            return cls()


# Singleton helper
_settings: Settings | None = None


def get_settings() -> Settings:
    """Return the global Settings singleton, loading from disk on first call."""
    global _settings
    if _settings is None:
        _settings = Settings.load_from_file()
    return _settings


def reload_settings() -> Settings:
    """Force-reload settings from disk."""
    global _settings
    _settings = Settings.load_from_file()
    return _settings
