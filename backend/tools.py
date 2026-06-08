"""Built-in tools the agent can call.

These are plain Python functions exposed as LangChain tools via the ``@tool``
decorator. MCP-provided tools will be merged into this registry in Phase 2.
"""
from __future__ import annotations

import datetime as _dt
import json
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
def position() -> str:
    """Detect the approximate geographic location (city, region, country, lat/long) and the
    local timezone, then return the current local date/time there. Use this to know the right
    timezone before reasoning about local time. Note: based on the server's public IP, so it
    reflects where the app is hosted rather than the end user's device.
    """
    info: dict | None = None
    # Primary: ipapi.co (HTTPS). Fallback: ip-api.com (HTTP).
    try:
        d = httpx.get("https://ipapi.co/json/", timeout=8).json()
        if d.get("timezone"):
            info = {
                "city": d.get("city"),
                "region": d.get("region"),
                "country": d.get("country_name"),
                "latitude": d.get("latitude"),
                "longitude": d.get("longitude"),
                "timezone": d.get("timezone"),
                "utc_offset": d.get("utc_offset"),
            }
    except Exception:  # noqa: BLE001
        pass
    if info is None:
        try:
            d = httpx.get("http://ip-api.com/json/", timeout=8).json()
            if d.get("status") == "success":
                info = {
                    "city": d.get("city"),
                    "region": d.get("regionName"),
                    "country": d.get("country"),
                    "latitude": d.get("lat"),
                    "longitude": d.get("lon"),
                    "timezone": d.get("timezone"),
                    "utc_offset": None,
                }
        except Exception:  # noqa: BLE001
            pass
    if info is None:
        return "Error: could not determine the location (geolocation services unavailable)."

    tz = info.get("timezone")
    if tz:
        try:
            from zoneinfo import ZoneInfo

            info["local_time"] = _dt.datetime.now(ZoneInfo(tz)).isoformat(timespec="seconds")
        except Exception:  # noqa: BLE001
            pass
    return json.dumps(info, ensure_ascii=False)


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
    t.name: t for t in (web_search, calculator, current_datetime, position, http_get)
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
