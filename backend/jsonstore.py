"""Atomic, lock-guarded JSON persistence for the local-backup stores.

The local JSON files (config / settings / auth_users / memories) are the fallback when
Supabase is unavailable. FastAPI runs the sync routes on a thread pool, and the agent's
tools run on other threads, so these files get read-modify-written concurrently. Without
a lock + atomic write, two writers clobber each other's keys, and a crash mid-write
leaves a truncated (corrupt) file that the next read silently treats as empty.

This module centralises the fix: one global lock + write-to-temp + ``os.replace`` (an
atomic rename). Every store calls ``update_json`` instead of rolling its own.
"""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Callable

_LOCK = threading.Lock()


def read_json(path: Path) -> dict:
    """Read a JSON object from ``path`` — or ``{}`` if missing/unreadable/not a dict."""
    try:
        if path.exists():
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
    except Exception:
        pass
    return {}


def update_json(path: Path, mutate: Callable[[dict], None]) -> bool:
    """Atomic read-modify-write under the global lock: read the file, let ``mutate`` edit
    the dict in place, then write it back via a temp file + ``os.replace``. Serialises
    concurrent writers (no clobbering) and never leaves a half-written file. Best-effort:
    returns whether it succeeded, never raises."""
    try:
        with _LOCK:
            data = read_json(path)
            mutate(data)
            tmp = path.parent / (path.name + ".tmp")
            tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
            os.replace(tmp, path)  # atomic rename
        return True
    except Exception:
        return False
