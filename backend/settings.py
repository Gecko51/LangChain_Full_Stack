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
    # Credentials. stdio servers read these as environment variables (e.g.
    # NOTION_TOKEN); sse/http servers send `headers` (e.g. Authorization). Both hold
    # secrets — they are NEVER returned to the client (see _public_mcp_server in main.py).
    env: dict[str, str] = Field(default_factory=dict)
    headers: dict[str, str] = Field(default_factory=dict)
    # Per-tool allowlist (namespaced names, e.g. "gmail__search"). None = all tools.
    allowed_tools: list[str] | None = None


class Settings(BaseModel):
    openrouter_api_key: str | None = None
    custom_prompts: list[CustomPrompt] = Field(default_factory=list)
    mcp_servers: list[MCPServer] = Field(default_factory=list)


class SettingsStore:
    """Per-user settings (memory cache + Supabase + local JSON backup).

    Each account's API key, prompts and MCP servers are private to that account.
    """

    def __init__(self) -> None:
        # username -> Settings (lazily loaded on first access).
        self._cache: dict[str, Settings] = {}

    # ----- local backup: { username: settings_dict } -----

    def _load_local_all(self) -> dict:
        if SETTINGS_FILE.exists():
            try:
                d = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
                # Ignore the legacy flat format (single settings, not keyed by user).
                if isinstance(d, dict) and "custom_prompts" not in d:
                    return d
            except Exception:
                pass
        return {}

    def _save_local(self, username: str, settings: Settings) -> None:
        try:
            allset = self._load_local_all()
            allset[username] = settings.model_dump()
            SETTINGS_FILE.write_text(json.dumps(allset, indent=2), encoding="utf-8")
        except Exception:
            pass

    def _load(self, username: str) -> Settings:
        # 1) Supabase, 2) local JSON, 3) empty defaults.
        doc = db.load_doc("app_settings", username)
        if doc:
            try:
                return Settings(**doc)
            except Exception:
                pass
        local = self._load_local_all().get(username)
        if local:
            try:
                return Settings(**local)
            except Exception:
                pass
        return Settings()

    def get(self, username: str) -> Settings:
        if username not in self._cache:
            self._cache[username] = self._load(username)
        return self._cache[username]

    def _save(self, username: str) -> None:
        s = self._cache[username]
        db.save_doc("app_settings", username, s.model_dump())
        self._save_local(username, s)

    # ----- API key -----

    def set_api_key(self, username: str, key: str | None) -> None:
        self.get(username).openrouter_api_key = (key or "").strip() or None
        self._save(username)

    # ----- Custom prompts -----

    def upsert_prompt(self, username: str, prompt: CustomPrompt) -> None:
        s = self.get(username)
        kept = [p for p in s.custom_prompts if p.name != prompt.name]
        kept.append(prompt)
        s.custom_prompts = kept
        self._save(username)

    def delete_prompt(self, username: str, name: str) -> None:
        s = self.get(username)
        s.custom_prompts = [p for p in s.custom_prompts if p.name != name]
        self._save(username)

    # ----- MCP servers -----

    def upsert_mcp_server(self, username: str, server: MCPServer) -> None:
        s = self.get(username)
        existing = next((x for x in s.mcp_servers if x.name == server.name), None)
        if existing:
            # Write-only credentials: the client never receives secret values, so a
            # blank/missing incoming value must KEEP the stored one (don't wipe creds
            # when the user only edits permissions or toggles). Non-blank values win.
            server.env = {**existing.env, **{k: v for k, v in server.env.items() if v}}
            server.headers = {
                **existing.headers,
                **{k: v for k, v in server.headers.items() if v},
            }
        kept = [x for x in s.mcp_servers if x.name != server.name]
        kept.append(server)
        s.mcp_servers = kept
        self._save(username)

    def set_allowed_tools(
        self, username: str, name: str, allowed: list[str] | None
    ) -> None:
        """Set a server's per-tool allowlist without touching its credentials."""
        s = self.get(username)
        for x in s.mcp_servers:
            if x.name == name:
                x.allowed_tools = allowed
        self._save(username)

    def delete_mcp_server(self, username: str, name: str) -> None:
        s = self.get(username)
        s.mcp_servers = [x for x in s.mcp_servers if x.name != name]
        self._save(username)

    def toggle_mcp_server(self, username: str, name: str) -> None:
        s = self.get(username)
        for x in s.mcp_servers:
            if x.name == name:
                x.enabled = not x.enabled
        self._save(username)


# Module-level singleton imported across the app.
settings_store = SettingsStore()
