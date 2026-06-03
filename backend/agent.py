"""Build the LangChain agent from the current config and stream a chat turn as SSE.

Uses the modern LangChain stack:
- ``init_chat_model("openrouter:<model>")`` for the LLM (OpenRouter provider),
- ``create_agent(...)`` for the tool-calling agent (built on LangGraph),
- ``agent.astream(stream_mode=["messages", "updates"])`` to get both incremental
  tokens AND completed tool calls in one loop.

Tools = enabled built-in tools + tools from enabled MCP servers.
"""
from __future__ import annotations

import json
import os
from typing import AsyncIterator

from langchain.agents import create_agent
from langchain.chat_models import init_chat_model
from langchain_core.messages import (
    AIMessage,
    AIMessageChunk,
    BaseMessage,
    HumanMessage,
    ToolMessage,
)
from langchain_core.tools import BaseTool

from config import AgentConfig
from mcp_manager import get_mcp_tools
from sessions import session_store
from settings import settings_store
from tools import get_enabled_tools

# The API key from the environment (.env), captured once at import. The UI can
# override it via settings; that takes precedence when present.
_ENV_OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY")


def _resolve_api_key() -> str | None:
    """The UI-provided key wins; otherwise fall back to the .env key."""
    return settings_store.get().openrouter_api_key or _ENV_OPENROUTER_KEY


async def gather_tools(config: AgentConfig) -> list[BaseTool]:
    """Enabled built-in tools + tools from enabled MCP servers."""
    builtin = get_enabled_tools(config.tools_enabled)
    mcp = await get_mcp_tools(settings_store.get().mcp_servers)
    return [*builtin, *mcp]


def build_agent(config: AgentConfig, tools: list[BaseTool]):
    """Create a fresh agent from the given config and pre-gathered tools.

    The OpenRouter provider reads ``OPENROUTER_API_KEY`` from the environment, so we
    set it from the resolved key just before building.
    """
    key = _resolve_api_key()
    if key:
        os.environ["OPENROUTER_API_KEY"] = key

    model = init_chat_model(
        f"openrouter:{config.model}",
        temperature=config.temperature,
        max_tokens=config.max_tokens,
    )
    return create_agent(model=model, tools=tools, system_prompt=config.system_prompt)


def _event(event: str, data: dict) -> dict:
    """Build an SSE event for sse-starlette (it formats the wire frame itself)."""
    return {"event": event, "data": json.dumps(data, ensure_ascii=False)}


async def stream_chat(
    config: AgentConfig, message: str, session_id: str
) -> AsyncIterator[dict]:
    """Yield SSE events for one chat turn: token / tool_start / tool_end / done / error."""
    try:
        tools = await gather_tools(config)
        agent = build_agent(config, tools)
    except Exception as exc:  # noqa: BLE001
        yield _event("error", {"error": "build_error", "detail": str(exc)})
        return

    # Input = prior history (trimmed to the window when memory is on) + the new message.
    history: list[BaseMessage] = (
        session_store.history(session_id, config.memory_window)
        if config.memory_enabled
        else []
    )
    user_msg = HumanMessage(content=message)
    input_messages = [*history, user_msg]

    final_parts: list[str] = []
    seen_tool_calls: set[str] = set()

    try:
        async for chunk in agent.astream(
            {"messages": input_messages},
            stream_mode=["messages", "updates"],
            version="v2",
        ):
            ctype = chunk.get("type") if isinstance(chunk, dict) else None

            # --- incremental assistant tokens ---
            if ctype == "messages":
                token, _meta = chunk["data"]
                text = getattr(token, "text", None)
                if isinstance(token, AIMessageChunk) and text:
                    final_parts.append(text)
                    yield _event("token", {"text": text})

            # --- completed steps: tool calls (from the model) and tool results ---
            elif ctype == "updates":
                for _source, update in chunk["data"].items():
                    if not isinstance(update, dict):
                        continue
                    messages = update.get("messages") or []
                    msg = messages[-1] if messages else None
                    if isinstance(msg, AIMessage) and msg.tool_calls:
                        for tc in msg.tool_calls:
                            tc_id = tc.get("id") or tc.get("name") or ""
                            if tc_id in seen_tool_calls:
                                continue
                            seen_tool_calls.add(tc_id)
                            yield _event(
                                "tool_start",
                                {
                                    "id": tc_id,
                                    "name": tc.get("name"),
                                    "input": tc.get("args", {}),
                                },
                            )
                    elif isinstance(msg, ToolMessage):
                        yield _event(
                            "tool_end",
                            {
                                "id": msg.tool_call_id,
                                "name": msg.name,
                                "output": str(msg.content),
                            },
                        )

        content = "".join(final_parts)
        # Persist the turn so memory works across requests.
        session_store.append(session_id, user_msg, AIMessage(content=content))
        yield _event("done", {"finish_reason": "stop", "content": content})

    except Exception as exc:  # noqa: BLE001
        # Any failure ends the stream with a structured error event.
        yield _event("error", {"error": "agent_error", "detail": str(exc)})
