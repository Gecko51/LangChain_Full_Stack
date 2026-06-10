"""Build the LangChain agent from the current config and stream a chat turn as SSE.

Uses the modern LangChain stack:
- ``init_chat_model("openrouter:<model>")`` for the LLM (OpenRouter provider),
- ``create_agent(...)`` for the tool-calling agent (built on LangGraph),
- ``agent.astream(stream_mode=["messages", "updates"])`` to get both incremental
  tokens AND completed tool calls in one loop.

Tools = enabled built-in tools + tools from enabled MCP servers.
"""
from __future__ import annotations

import asyncio
import json
import os
from typing import AsyncIterator

import httpx
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

import rag
from config import AgentConfig
from mcp_manager import get_mcp_tools
from memory_store import memory_preamble, memory_store
from sessions import session_store
from settings import Settings
from tools import get_enabled_tools, make_memory_tools, make_rag_tools

# The API key from the environment (.env), captured once at import. The UI can
# override it via settings; that takes precedence when present.
_ENV_OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY")


def _resolve_api_key(user_key: str | None) -> str | None:
    """The user's saved key wins; otherwise fall back to the .env key."""
    return user_key or _ENV_OPENROUTER_KEY


async def fetch_generation_cost(generation_id: str, user_key: str | None) -> float | None:
    """OpenRouter cost (USD) for a generation, by id.

    The generation record only appears a few seconds after the request finishes,
    so we retry. Returns None if it can't be fetched.
    """
    key = _resolve_api_key(user_key)
    if not generation_id or not key:
        return None
    async with httpx.AsyncClient(timeout=10) as client:
        for _ in range(6):
            try:
                resp = await client.get(
                    "https://openrouter.ai/api/v1/generation",
                    params={"id": generation_id},
                    headers={"Authorization": f"Bearer {key}"},
                )
                if resp.status_code == 200:
                    return resp.json().get("data", {}).get("total_cost")
            except Exception:
                pass
            await asyncio.sleep(1.0)
    return None


async def gather_tools(
    config: AgentConfig, mcp_servers: list, username: str, api_key: str | None
) -> list[BaseTool]:
    """Enabled built-in tools + the user's `remember` tool (long-term memory) +
    `search_knowledge_base` (RAG, when a key is available) + enabled MCP server tools."""
    builtin = get_enabled_tools(config.tools_enabled)
    memory = make_memory_tools(username, memory_store) if config.longterm_memory else []
    # RAG needs the key to embed the query; skip the tool if no key is configured.
    rag_tools = (
        make_rag_tools(username, api_key, rag.search)
        if config.rag_enabled and api_key
        else []
    )
    mcp = await get_mcp_tools(mcp_servers)
    return [*builtin, *memory, *rag_tools, *mcp]


def build_agent(
    config: AgentConfig,
    tools: list[BaseTool],
    api_key: str | None,
    system_prompt: str | None = None,
):
    """Create a fresh agent from the given config and pre-gathered tools.

    ``system_prompt`` overrides ``config.system_prompt`` (used to append the long-term
    memory block). The resolved key (the user's, else the .env key) is passed EXPLICITLY
    to the model via ``api_key=`` — never written to ``os.environ``. Mutating the
    process-global env is concurrency-hostile and, with concurrent users, could bill one
    user's request to another user's key (a keyless user would inherit the previous key).
    """
    key = _resolve_api_key(api_key)
    if not key:
        raise ValueError(
            "No OpenRouter API key configured. Add your key in Settings "
            "(or set OPENROUTER_API_KEY on the server)."
        )

    model = init_chat_model(
        f"openrouter:{config.model}",
        temperature=config.temperature,
        max_tokens=config.max_tokens,
        api_key=key,  # ChatOpenRouter accepts the `api_key` alias — kept per-request
    )
    return create_agent(
        model=model, tools=tools, system_prompt=system_prompt or config.system_prompt
    )


def _event(event: str, data: dict) -> dict:
    """Build an SSE event for sse-starlette (it formats the wire frame itself)."""
    return {"event": event, "data": json.dumps(data, ensure_ascii=False)}


def _message_text(content) -> str:
    """Extract plain answer text from an AIMessage content, which may be a string OR a
    list of blocks (reasoning models / some providers). Joins the text blocks and ignores
    reasoning blocks — never the raw Python repr of the list."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text", "")))
        return "".join(parts)
    return str(content)


async def run_once(
    config: AgentConfig, settings: Settings, message: str, username: str
) -> str:
    """Run the agent once (no streaming) and return its final answer text. Used by
    scheduled tasks: it gets the user's tools + long-term memory + RAG, but no chat
    history (each scheduled run is a fresh one-shot)."""
    key = _resolve_api_key(settings.openrouter_api_key)
    tools = await gather_tools(config, settings.mcp_servers, username, key)
    memories = memory_store.get(username) if config.longterm_memory else []
    system_prompt = config.system_prompt + memory_preamble(memories)
    agent = build_agent(
        config, tools, settings.openrouter_api_key, system_prompt=system_prompt
    )
    result = await agent.ainvoke({"messages": [HumanMessage(content=message)]})
    for m in reversed(result.get("messages", [])):
        if isinstance(m, AIMessage) and m.content:
            return _message_text(m.content)
    return ""


async def stream_chat(
    config: AgentConfig,
    settings: Settings,
    message: str,
    session_id: str,
    username: str,
) -> AsyncIterator[dict]:
    """Yield SSE events for one chat turn: token / tool_start / tool_end / done / error."""
    try:
        key = _resolve_api_key(settings.openrouter_api_key)
        tools = await gather_tools(config, settings.mcp_servers, username, key)
        # Long-term memory: prepend saved facts to the system prompt so the agent
        # "knows" them automatically (bounded by a char budget for flat cost).
        memories = memory_store.get(username) if config.longterm_memory else []
        system_prompt = config.system_prompt + memory_preamble(memories)
        agent = build_agent(
            config, tools, settings.openrouter_api_key, system_prompt=system_prompt
        )
    except Exception as exc:  # noqa: BLE001
        yield _event("error", {"error": "build_error", "detail": str(exc)})
        return

    # Input = prior history (trimmed to the window when memory is on) + the new message.
    history: list[BaseMessage] = (
        session_store.history(username, session_id, config.memory_window)
        if config.memory_enabled
        else []
    )
    user_msg = HumanMessage(content=message)
    input_messages = [*history, user_msg]

    final_parts: list[str] = []
    seen_tool_calls: set[str] = set()
    # id -> {id, name, input, output}: kept so the turn's tool calls can be persisted
    # for the UI (a reloaded conversation re-renders its tool bubbles).
    turn_tool_calls: dict[str, dict] = {}
    usage_md: dict | None = None  # OpenRouter token usage (last LLM call)
    gen_id: str | None = None  # OpenRouter generation id (for the cost lookup)
    persisted = False  # did we already save this turn?

    try:
        async for chunk in agent.astream(
            {"messages": input_messages},
            stream_mode=["messages", "updates"],
            version="v2",
        ):
            ctype = chunk.get("type") if isinstance(chunk, dict) else None

            # --- incremental assistant tokens (+ usage metadata) ---
            if ctype == "messages":
                token, _meta = chunk["data"]
                if isinstance(token, AIMessageChunk):
                    if token.usage_metadata:
                        usage_md = dict(token.usage_metadata)
                    rid = token.response_metadata.get("id")
                    if rid:
                        gen_id = rid
                    text = getattr(token, "text", None)
                    if text:
                        final_parts.append(text)
                        yield _event("token", {"text": text})

            # --- completed steps: tool calls (from the model) and tool results ---
            elif ctype == "updates":
                for _source, update in chunk["data"].items():
                    if not isinstance(update, dict):
                        continue
                    messages = update.get("messages") or []
                    msg = messages[-1] if messages else None
                    if isinstance(msg, AIMessage):
                        if msg.usage_metadata:
                            usage_md = dict(msg.usage_metadata)
                        rid = msg.response_metadata.get("id")
                        if rid:
                            gen_id = rid
                    if isinstance(msg, AIMessage) and msg.tool_calls:
                        for tc in msg.tool_calls:
                            tc_id = tc.get("id") or tc.get("name") or ""
                            if tc_id in seen_tool_calls:
                                continue
                            seen_tool_calls.add(tc_id)
                            turn_tool_calls[tc_id] = {
                                "id": tc_id,
                                "name": tc.get("name"),
                                "input": tc.get("args", {}),
                            }
                            yield _event(
                                "tool_start",
                                {
                                    "id": tc_id,
                                    "name": tc.get("name"),
                                    "input": tc.get("args", {}),
                                },
                            )
                    elif isinstance(msg, ToolMessage):
                        entry = turn_tool_calls.get(msg.tool_call_id)
                        if entry is not None:
                            entry["output"] = str(msg.content)
                        yield _event(
                            "tool_end",
                            {
                                "id": msg.tool_call_id,
                                "name": msg.name,
                                "output": str(msg.content),
                            },
                        )

        content = "".join(final_parts)
        # Persist the turn: text drives the agent's replay, tool_calls re-hydrate the UI.
        session_store.append_turn(
            username, session_id, message, content, list(turn_tool_calls.values())
        )
        persisted = True
        # Token usage (cost is fetched lazily by the client via /chat/cost).
        if usage_md:
            details = usage_md.get("output_token_details") or {}
            yield _event(
                "usage",
                {
                    "prompt_tokens": usage_md.get("input_tokens"),
                    "completion_tokens": usage_md.get("output_tokens"),
                    "total_tokens": usage_md.get("total_tokens"),
                    "reasoning_tokens": details.get("reasoning", 0),
                    "generation_id": gen_id,
                },
            )
        yield _event("done", {"finish_reason": "stop", "content": content})

    except Exception as exc:  # noqa: BLE001
        # Any failure ends the stream with a structured error event.
        yield _event("error", {"error": "agent_error", "detail": str(exc)})
    finally:
        # If the client aborted mid-stream (Stop button → GeneratorExit, not caught
        # above), still persist the partial turn so the UI (which keeps the partial
        # bubble) and the agent's memory stay in sync on the next message.
        if not persisted and final_parts:
            session_store.append_turn(
                username, session_id, message, "".join(final_parts),
                list(turn_tool_calls.values()),
            )
