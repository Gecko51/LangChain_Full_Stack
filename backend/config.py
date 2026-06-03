"""Agent configuration model, defaults, and the in-memory config store.

The config is the single source of truth for how the agent behaves. It lives in
memory (a module-level singleton) and is mirrored to ``config.json`` so it survives
server restarts. Updating it does NOT require a restart: the agent is rebuilt from
the current config on every request.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

# File where the current config is persisted (git-ignored).
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


# Default config used on first boot (no persisted file yet).
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
    """Holds the single source of truth for the agent config (memory + JSON file)."""

    def __init__(self) -> None:
        self._config = self._load()

    def _load(self) -> AgentConfig:
        # Load the persisted config if present, otherwise fall back to defaults.
        if CONFIG_FILE.exists():
            try:
                data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
                return AgentConfig(**data)
            except Exception:
                # Corrupted/invalid file -> ignore it and use defaults.
                return DEFAULT_CONFIG.model_copy(deep=True)
        return DEFAULT_CONFIG.model_copy(deep=True)

    def get(self) -> AgentConfig:
        """Return the current config."""
        return self._config

    def update(self, config: AgentConfig) -> AgentConfig:
        """Replace the config (hot-reload) and mirror it to disk."""
        self._config = config
        self._save()
        return self._config

    def _save(self) -> None:
        CONFIG_FILE.write_text(
            self._config.model_dump_json(indent=2), encoding="utf-8"
        )


# Module-level singleton imported across the app.
config_store = ConfigStore()
