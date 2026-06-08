"""Agent configuration model, defaults, and the config store.

Source of truth = in-memory singleton. Persistence: Supabase (``agent_config``) when
configured, with a local ``config.json`` backup; falls back to the JSON file or the
defaults when Supabase is unavailable.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

import db

# Local backup file (git-ignored).
CONFIG_FILE = Path(__file__).parent / "config.json"


class AgentConfig(BaseModel):
    """All tunable parameters of the agent, edited live from the UI."""

    system_prompt: str = Field(min_length=1)
    # OpenRouter model id, e.g. "anthropic/claude-sonnet-4-5".
    model: str = Field(min_length=1)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=2048, ge=256, le=8192)
    # "pydantic" structured output is planned for Phase 2.
    output_parser: Literal["str", "json"] = "str"
    tools_enabled: list[str] = Field(default_factory=list)
    memory_enabled: bool = True
    memory_window: int = Field(default=10, ge=1, le=20)
    streaming: bool = True


# Default config used on first boot (no persisted config yet).
DEFAULT_CONFIG = AgentConfig(
    system_prompt=(
        "You are an expert AI assistant. "
        "Answer clearly, concisely, and in a structured way."
    ),
    model="anthropic/claude-sonnet-4-5",
    temperature=0.7,
    max_tokens=2048,
    output_parser="str",
    tools_enabled=[],
    memory_enabled=True,
    memory_window=10,
    streaming=True,
)


class ConfigStore:
    """Holds the agent config (memory + Supabase + local JSON backup)."""

    def __init__(self) -> None:
        self._config = self._load()
        # Mirror the active state to Supabase (initial sync from local JSON).
        self._save()

    def _load(self) -> AgentConfig:
        # 1) Supabase, 2) local JSON file, 3) defaults.
        doc = db.load_doc("agent_config")
        if doc:
            try:
                return AgentConfig(**doc)
            except Exception:
                pass
        if CONFIG_FILE.exists():
            try:
                return AgentConfig(**json.loads(CONFIG_FILE.read_text(encoding="utf-8")))
            except Exception:
                pass
        return DEFAULT_CONFIG.model_copy(deep=True)

    def _save(self) -> None:
        # Local backup always; Supabase best-effort.
        try:
            CONFIG_FILE.write_text(
                self._config.model_dump_json(indent=2), encoding="utf-8"
            )
        except Exception:
            pass
        db.save_doc("agent_config", self._config.model_dump())

    def get(self) -> AgentConfig:
        return self._config

    def update(self, config: AgentConfig) -> AgentConfig:
        """Replace the config (hot-reload) and persist it."""
        self._config = config
        self._save()
        return self._config


# Module-level singleton imported across the app.
config_store = ConfigStore()
