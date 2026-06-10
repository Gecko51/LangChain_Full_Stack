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
    # Long-term memory: inject saved facts into the prompt + give the agent a `remember`
    # tool. Distinct from `memory_enabled` (the short-term conversation window).
    longterm_memory: bool = True
    # RAG: give the agent a `search_knowledge_base` tool over the user's uploaded docs.
    rag_enabled: bool = True
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
    longterm_memory=True,
    rag_enabled=True,
    streaming=True,
)


class ConfigStore:
    """Per-user agent config (memory cache + Supabase + local JSON backup).

    Each user gets their own config; nothing is shared between accounts.
    """

    def __init__(self) -> None:
        # username -> AgentConfig (lazily loaded on first access).
        self._cache: dict[str, AgentConfig] = {}

    # ----- local backup: { username: config_dict } -----

    def _load_local_all(self) -> dict:
        if CONFIG_FILE.exists():
            try:
                d = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
                # Ignore the legacy flat format (a single config, not keyed by user).
                if isinstance(d, dict) and "system_prompt" not in d:
                    return d
            except Exception:
                pass
        return {}

    def _save_local(self, username: str, config: AgentConfig) -> None:
        try:
            allcfg = self._load_local_all()
            allcfg[username] = config.model_dump()
            CONFIG_FILE.write_text(json.dumps(allcfg, indent=2), encoding="utf-8")
        except Exception:
            pass

    def _load(self, username: str) -> AgentConfig:
        # 1) Supabase, 2) local JSON, 3) defaults.
        doc = db.load_doc("agent_config", username)
        if doc:
            try:
                return AgentConfig(**doc)
            except Exception:
                pass
        local = self._load_local_all().get(username)
        if local:
            try:
                return AgentConfig(**local)
            except Exception:
                pass
        return DEFAULT_CONFIG.model_copy(deep=True)

    def get(self, username: str) -> AgentConfig:
        if username not in self._cache:
            self._cache[username] = self._load(username)
        return self._cache[username]

    def update(self, username: str, config: AgentConfig) -> AgentConfig:
        """Replace a user's config (hot-reload) and persist it."""
        self._cache[username] = config
        db.save_doc("agent_config", username, config.model_dump())
        self._save_local(username, config)
        return config


# Module-level singleton imported across the app.
config_store = ConfigStore()
