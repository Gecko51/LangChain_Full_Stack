"""User settings: OpenRouter API key, custom prompts, and MCP servers.

Persistence: Supabase (``app_settings``) when configured, with a local
``settings.json`` backup; falls back to the JSON file when Supabase is unavailable.
The API key is never sent back to the client in plain text.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

import db

SETTINGS_FILE = Path(__file__).parent / "settings.json"


class CustomPrompt(BaseModel):
    """A reusable prompt, invoked from the chat with /<name>."""

    name: str = Field(min_length=1, max_length=40)
    content: str = Field(min_length=1)


class MCPServer(BaseModel):
    """An MCP server whose tools are merged into the agent when enabled."""

    name: str = Field(min_length=1, max_length=40)
    transport: Literal["stdio", "sse", "http"] = "stdio"
    command: str | None = None
    args: list[str] = Field(default_factory=list)
    url: str | None = None
    enabled: bool = True


class Settings(BaseModel):
    openrouter_api_key: str | None = None
    custom_prompts: list[CustomPrompt] = Field(default_factory=list)
    mcp_servers: list[MCPServer] = Field(default_factory=list)


class SettingsStore:
    """Holds the settings (memory + Supabase + local JSON backup)."""

    def __init__(self) -> None:
        self._settings = self._load()
        # Mirror the active state to Supabase (initial sync from local JSON).
        self._save()

    def _load(self) -> Settings:
        # 1) Supabase, 2) local JSON file, 3) empty defaults.
        doc = db.load_doc("app_settings")
        if doc:
            try:
                return Settings(**doc)
            except Exception:
                pass
        if SETTINGS_FILE.exists():
            try:
                return Settings(**json.loads(SETTINGS_FILE.read_text(encoding="utf-8")))
            except Exception:
                pass
        return Settings()

    def _save(self) -> None:
        try:
            SETTINGS_FILE.write_text(
                self._settings.model_dump_json(indent=2), encoding="utf-8"
            )
        except Exception:
            pass
        db.save_doc("app_settings", self._settings.model_dump())

    def get(self) -> Settings:
        return self._settings

    # ----- API key -----

    def set_api_key(self, key: str | None) -> None:
        self._settings.openrouter_api_key = (key or "").strip() or None
        self._save()

    # ----- Custom prompts -----

    def upsert_prompt(self, prompt: CustomPrompt) -> None:
        kept = [p for p in self._settings.custom_prompts if p.name != prompt.name]
        kept.append(prompt)
        self._settings.custom_prompts = kept
        self._save()

    def delete_prompt(self, name: str) -> None:
        self._settings.custom_prompts = [
            p for p in self._settings.custom_prompts if p.name != name
        ]
        self._save()

    # ----- MCP servers -----

    def upsert_mcp_server(self, server: MCPServer) -> None:
        kept = [s for s in self._settings.mcp_servers if s.name != server.name]
        kept.append(server)
        self._settings.mcp_servers = kept
        self._save()

    def delete_mcp_server(self, name: str) -> None:
        self._settings.mcp_servers = [
            s for s in self._settings.mcp_servers if s.name != name
        ]
        self._save()

    def toggle_mcp_server(self, name: str) -> None:
        for s in self._settings.mcp_servers:
            if s.name == name:
                s.enabled = not s.enabled
        self._save()


# Module-level singleton imported across the app.
settings_store = SettingsStore()
