"""Basic backend tests — no LLM or network calls.

These cover the config store, the tool registry, and the /health endpoint. The
streaming SSE mapping is covered separately once the agent runs against a real model.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

import config as config_module
from config import DEFAULT_CONFIG, ConfigStore
from tools import TOOL_REGISTRY, get_enabled_tools, list_tools


def test_default_config_valid():
    assert 0.0 <= DEFAULT_CONFIG.temperature <= 2.0
    assert DEFAULT_CONFIG.output_parser in ("str", "json")


def test_config_store_round_trip(tmp_path, monkeypatch):
    # Redirect the store's file to a temp path so we don't touch the real config.json.
    monkeypatch.setattr(config_module, "CONFIG_FILE", tmp_path / "config.json")
    store = ConfigStore()
    store.update(DEFAULT_CONFIG.model_copy(update={"temperature": 1.3, "memory_window": 5}))
    # A fresh store must load the persisted values.
    reloaded = ConfigStore()
    assert reloaded.get().temperature == 1.3
    assert reloaded.get().memory_window == 5


def test_calculator_tool():
    assert get_enabled_tools(["calculator"])  # known tool resolves
    assert TOOL_REGISTRY["calculator"].invoke({"expression": "3 * (4 + 2)"}) == "18"
    # Non-arithmetic input is rejected (eval cannot run code).
    assert "Error" in TOOL_REGISTRY["calculator"].invoke({"expression": "__import__('os')"})


def test_list_tools_flags_enabled():
    by_name = {t["name"]: t for t in list_tools(["web_search"])}
    assert by_name["web_search"]["enabled"] is True
    assert by_name["calculator"]["enabled"] is False


def test_health_endpoint():
    # Importing main also smoke-tests the agent/langchain imports.
    from main import app

    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
