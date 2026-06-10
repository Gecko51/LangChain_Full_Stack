"""Connect to MCP servers and expose their tools to the agent.

Uses ``langchain-mcp-adapters`` ``MultiServerMCPClient``. MCP stdio servers spawn a
local process (e.g. ``npx ...``), so this only works where that command is available
(locally — a cloud image needs Node). sse/http servers connect over the network.
Errors are isolated per server and surfaced to the UI instead of crashing the chat.

Credentials: stdio servers read ``env`` vars (e.g. NOTION_TOKEN), sse/http servers
send ``headers`` (e.g. Authorization). Discovered tools are namespaced ``server__tool``
to avoid collisions, and filtered by the server's per-tool allowlist.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import sys

from langchain_core.tools import BaseTool
from langchain_mcp_adapters.client import MultiServerMCPClient

from settings import MCPServer

# Cache keyed by the enabled-servers config so we don't re-spawn processes every chat.
_cache_key: str | None = None
_cache_tools: list[BaseTool] = []


def _resolve_command(command: str) -> str:
    """On Windows, resolve a bare command like ``npx`` to its real path (``npx.cmd``)."""
    if sys.platform == "win32" and command:
        resolved = shutil.which(command)
        if resolved:
            return resolved
    return command


def _safe_base_env() -> dict[str, str]:
    """A minimal base environment for spawned stdio servers (PATH etc. so they can find
    node/npx) that deliberately EXCLUDES the app's own secrets (OPENROUTER_API_KEY,
    AUTH_SECRET, SUPABASE_*). The user's connector ``env`` is layered on top."""
    try:
        from mcp.client.stdio import get_default_environment

        return dict(get_default_environment())
    except Exception:  # noqa: BLE001
        keep = (
            "PATH", "HOME", "USERPROFILE", "SystemRoot", "APPDATA",
            "LOCALAPPDATA", "TEMP", "TMP", "PATHEXT", "LANG", "TZ",
        )
        return {k: os.environ[k] for k in keep if k in os.environ}


def _connection(server: MCPServer) -> dict:
    """Build a langchain-mcp-adapters connection dict for one server."""
    if server.transport == "stdio":
        conn: dict = {
            "transport": "stdio",
            "command": _resolve_command(server.command or ""),
            "args": server.args or [],
        }
        if server.env:
            conn["env"] = {**_safe_base_env(), **server.env}
        return conn
    transport = "sse" if server.transport == "sse" else "streamable_http"
    conn = {"transport": transport, "url": server.url or ""}
    if server.headers:
        conn["headers"] = server.headers
    return conn


def _namespace(server_name: str, tool_name: str) -> str:
    """Prefix a tool with its server so two connectors can't shadow each other
    (e.g. two 'search' tools). Sanitised to a valid tool-name charset."""
    prefix = re.sub(r"[^a-zA-Z0-9_]", "_", server_name)
    return f"{prefix}__{tool_name}"


async def _server_tools(server: MCPServer, apply_allowlist: bool = True) -> list[BaseTool]:
    """Connect to one server and return its namespaced tools. When ``apply_allowlist``
    is set, drop tools not in the server's ``allowed_tools`` (None = all allowed)."""
    client = MultiServerMCPClient({server.name: _connection(server)})
    out: list[BaseTool] = []
    for t in await client.get_tools():
        t.name = _namespace(server.name, t.name)
        if apply_allowlist and server.allowed_tools is not None and t.name not in server.allowed_tools:
            continue
        out.append(t)
    return out


async def get_mcp_tools(servers: list[MCPServer]) -> list[BaseTool]:
    """Return the (namespaced, allowlist-filtered) tools from all enabled servers."""
    global _cache_key, _cache_tools

    enabled = [s for s in servers if s.enabled]
    key = json.dumps([s.model_dump() for s in enabled], sort_keys=True)
    if key == _cache_key:
        return _cache_tools

    tools: list[BaseTool] = []
    for s in enabled:
        try:
            tools.extend(await _server_tools(s))
        except Exception:  # noqa: BLE001
            # A failing server simply contributes no tools (see discover() for the error).
            pass

    _cache_key, _cache_tools = key, tools
    return tools


async def discover(servers: list[MCPServer]) -> list[dict]:
    """For the UI: each server with ALL its discovered (namespaced) tool names — even the
    ones disabled by the allowlist, so the user can toggle them — or its error."""
    out: list[dict] = []
    for s in servers:
        if not s.enabled:
            out.append({"name": s.name, "enabled": False, "tools": [], "error": None})
            continue
        try:
            tool_objs = await _server_tools(s, apply_allowlist=False)
            out.append(
                {
                    "name": s.name,
                    "enabled": True,
                    "tools": [t.name for t in tool_objs],
                    "error": None,
                }
            )
        except Exception as exc:  # noqa: BLE001
            out.append(
                {"name": s.name, "enabled": True, "tools": [], "error": str(exc)[:400]}
            )
    return out
