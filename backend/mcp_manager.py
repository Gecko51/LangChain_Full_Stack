"""Connect to MCP servers and expose their tools to the agent.

Uses ``langchain-mcp-adapters`` ``MultiServerMCPClient``. MCP stdio servers spawn a
local process (e.g. ``npx ...``), so this only works where that command is available
(locally — a cloud image would need Node). Errors are isolated per server and surfaced
to the UI instead of crashing the chat.
"""
from __future__ import annotations

import json
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


def _connection(server: MCPServer) -> dict:
    """Build a langchain-mcp-adapters connection dict for one server."""
    if server.transport == "stdio":
        return {
            "transport": "stdio",
            "command": _resolve_command(server.command or ""),
            "args": server.args or [],
        }
    if server.transport == "sse":
        return {"transport": "sse", "url": server.url or ""}
    return {"transport": "streamable_http", "url": server.url or ""}


async def get_mcp_tools(servers: list[MCPServer]) -> list[BaseTool]:
    """Return the tools from all enabled MCP servers (cached by config)."""
    global _cache_key, _cache_tools

    enabled = [s for s in servers if s.enabled]
    key = json.dumps([s.model_dump() for s in enabled], sort_keys=True)
    if key == _cache_key:
        return _cache_tools

    tools: list[BaseTool] = []
    for s in enabled:
        try:
            client = MultiServerMCPClient({s.name: _connection(s)})
            tools.extend(await client.get_tools())
        except Exception:  # noqa: BLE001
            # A failing server simply contributes no tools (see discover() for the error).
            pass

    _cache_key, _cache_tools = key, tools
    return tools


async def discover(servers: list[MCPServer]) -> list[dict]:
    """For the UI: each server with its discovered tool names, or its error."""
    out: list[dict] = []
    for s in servers:
        if not s.enabled:
            out.append({"name": s.name, "enabled": False, "tools": [], "error": None})
            continue
        try:
            client = MultiServerMCPClient({s.name: _connection(s)})
            tool_objs = await client.get_tools()
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
