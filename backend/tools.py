"""Built-in tools the agent can call.

These are plain Python functions exposed as LangChain tools via the ``@tool``
decorator. MCP-provided tools will be merged into this registry in Phase 2.
"""
from __future__ import annotations

import datetime as _dt
import re

import httpx
from langchain_core.tools import BaseTool, tool


@tool
def calculator(expression: str) -> str:
    """Evaluate a basic arithmetic expression like "3 * (4 + 2)".

    Only digits and the characters + - * / ( ) . % are allowed.
    """
    # Whitelist the input so eval() cannot run arbitrary code.
    if not re.fullmatch(r"[0-9+\-*/(). %]+", expression or ""):
        return "Error: only numbers and + - * / ( ) . % are allowed."
    try:
        # Empty builtins + whitelisted chars make this safe for arithmetic only.
        result = eval(expression, {"__builtins__": {}}, {})  # noqa: S307
        return str(result)
    except Exception as exc:  # noqa: BLE001
        return f"Error: could not evaluate '{expression}' ({exc})"


@tool
def current_datetime() -> str:
    """Return the current UTC date and time in ISO 8601 format."""
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


@tool
def http_get(url: str) -> str:
    """Fetch a URL and return the first 2000 characters of its text body."""
    try:
        resp = httpx.get(url, timeout=15, follow_redirects=True)
        resp.raise_for_status()
        return resp.text[:2000]
    except Exception as exc:  # noqa: BLE001
        return f"Error: request to '{url}' failed ({exc})"


@tool
def web_search(query: str) -> str:
    """Search the web (DuckDuckGo) and return the top results as text."""
    try:
        from ddgs import DDGS

        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=5))
        if not results:
            return "No results found."
        return "\n\n".join(
            f"{r.get('title')}\n{r.get('href')}\n{r.get('body')}" for r in results
        )
    except Exception as exc:  # noqa: BLE001
        return f"Error: search for '{query}' failed ({exc})"


# Registry: tool name -> tool instance.
TOOL_REGISTRY: dict[str, BaseTool] = {
    t.name: t for t in (web_search, calculator, current_datetime, http_get)
}


def get_enabled_tools(names: list[str]) -> list[BaseTool]:
    """Return the tool instances whose names are in ``names`` (unknown names ignored)."""
    return [TOOL_REGISTRY[n] for n in names if n in TOOL_REGISTRY]


def list_tools(enabled: list[str]) -> list[dict]:
    """Return metadata for every built-in tool, flagging which ones are enabled."""
    return [
        {
            "name": name,
            "description": (t.description or "").strip(),
            "enabled": name in enabled,
        }
        for name, t in TOOL_REGISTRY.items()
    ]
