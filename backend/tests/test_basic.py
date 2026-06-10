"""Basic backend tests — no LLM or network calls.

These cover the config store, the tool registry, and the /health endpoint. The
streaming SSE mapping is covered separately once the agent runs against a real model.
"""
from __future__ import annotations

import pytest
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
    store.update(
        "alice", DEFAULT_CONFIG.model_copy(update={"temperature": 1.3, "memory_window": 5})
    )
    # A fresh store must load the persisted values for that user.
    reloaded = ConfigStore()
    assert reloaded.get("alice").temperature == 1.3
    assert reloaded.get("alice").memory_window == 5
    # A different user gets defaults, not alice's config (isolation).
    assert reloaded.get("bob").temperature == DEFAULT_CONFIG.temperature


def test_calculator_tool():
    assert get_enabled_tools(["calculator"])  # known tool resolves
    assert TOOL_REGISTRY["calculator"].invoke({"expression": "3 * (4 + 2)"}) == "18"
    assert TOOL_REGISTRY["calculator"].invoke({"expression": "2 + 3 * 4"}) == "14"
    assert TOOL_REGISTRY["calculator"].invoke({"expression": "10 % 3"}) == "1"
    # Non-arithmetic input is rejected (no eval, AST walker only).
    assert "Error" in TOOL_REGISTRY["calculator"].invoke({"expression": "__import__('os')"})


def test_calculator_rejects_power_dos():
    """`**` is a CPU/RAM bomb (9**9**9); the AST walker must reject it, fast."""
    import time

    start = time.monotonic()
    out = TOOL_REGISTRY["calculator"].invoke({"expression": "9**9**9"})
    assert "Error" in out
    assert time.monotonic() - start < 1.0  # rejected immediately, never computed


def test_http_get_blocks_ssrf():
    """http_get must refuse internal/loopback/metadata/non-http targets (SSRF guard)."""
    call = TOOL_REGISTRY["http_get"].invoke
    assert "Error" in call({"url": "http://127.0.0.1/"})
    assert "Error" in call({"url": "http://localhost:8000/health"})
    assert "Error" in call({"url": "http://169.254.169.254/latest/meta-data/"})  # cloud metadata
    assert "Error" in call({"url": "http://10.0.0.1/"})  # private RFC1918
    assert "Error" in call({"url": "http://100.100.100.200/"})  # Alibaba metadata (CGNAT)
    assert "Error" in call({"url": "http://100.64.0.1/"})  # RFC6598 CGNAT range
    assert "Error" in call({"url": "http://0.0.0.0/"})  # unspecified
    assert "Error" in call({"url": "http://2130706433/"})  # decimal-encoded 127.0.0.1
    assert "http" in call({"url": "file:///etc/passwd"}).lower()  # scheme rejected


def test_list_tools_flags_enabled():
    by_name = {t["name"]: t for t in list_tools(["web_search"])}
    assert by_name["web_search"]["enabled"] is True
    assert by_name["calculator"]["enabled"] is False


def test_auth_secret_fails_closed(monkeypatch):
    """No AUTH_SECRET (and no explicit dev opt-in) must refuse to run, not sign with
    a guessable default — otherwise anyone could forge a token for any username."""
    import auth

    monkeypatch.delenv("AUTH_SECRET", raising=False)
    monkeypatch.delenv("ALLOW_INSECURE_AUTH", raising=False)
    with pytest.raises(RuntimeError):
        auth._resolve_secret()
    # The insecure default, known placeholders, and too-short values are all refused.
    for weak in ("dev-insecure-secret-change-me", "change-me", "secret", "short"):
        monkeypatch.setenv("AUTH_SECRET", weak)
        with pytest.raises(RuntimeError):
            auth._resolve_secret()
    # A real secret is accepted; the explicit dev opt-in is too.
    monkeypatch.setenv("AUTH_SECRET", "a-real-strong-secret")
    assert auth._resolve_secret() == "a-real-strong-secret"
    monkeypatch.delenv("AUTH_SECRET", raising=False)
    monkeypatch.setenv("ALLOW_INSECURE_AUTH", "1")
    assert auth._resolve_secret()  # dev escape hatch returns the default, doesn't raise


def test_health_endpoint():
    # Importing main also smoke-tests the agent/langchain imports.
    from main import app

    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
