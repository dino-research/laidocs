"""LAIDocs configuration management using pydantic-settings with JSON persistence."""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel
from pydantic_settings import BaseSettings

LAIDOCS_HOME = Path.home() / ".laidocs"
CONFIG_PATH = LAIDOCS_HOME / "config.json"


class LLMConfig(BaseModel):
    base_url: str = ""
    api_key: str = ""
    model: str = ""


class Settings(BaseSettings):
    """LAIDocs application settings persisted to ~/.laidocs/config.json."""

    llm: LLMConfig = LLMConfig()
    port: int = 8008

    model_config = {"arbitrary_types_allowed": True}

    def save_to_file(self, path: Path | None = None) -> None:
        target = path or CONFIG_PATH
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(self.model_dump_json(indent=2), encoding="utf-8")

    @classmethod
    def load_from_file(cls, path: Path | None = None) -> Settings:
        target = path or CONFIG_PATH
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            return cls()
        try:
            raw = json.loads(target.read_text(encoding="utf-8"))
            # Filter out removed keys for backward compat
            valid_keys = cls.model_fields.keys()
            filtered = {k: v for k, v in raw.items() if k in valid_keys}
            return cls.model_validate(filtered)
        except (json.JSONDecodeError, Exception):
            return cls()


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings.load_from_file()
    return _settings


def reload_settings() -> Settings:
    global _settings
    _settings = Settings.load_from_file()
    return _settings
