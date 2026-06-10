"""Scheduled background agent runs.

Render's free dyno sleeps, so there is no always-on scheduler. Instead an EXTERNAL cron
(the keep-alive GitHub Action) hits ``POST /scheduled/run-due`` every few minutes; that
endpoint runs whatever tasks are due. Each task = a stored prompt + a 5-field cron
expression (UTC). When due, the agent runs once and the result is stored on the task.
"""
from __future__ import annotations

from datetime import datetime, timezone

from croniter import croniter
from pydantic import BaseModel, Field

# Per-user cap + a minimum gap between runs — bounds how much a single account can spend
# (registration is open and keyless accounts run on the server's shared key).
MAX_TASKS_PER_USER = 10
MIN_INTERVAL_SECONDS = 3600  # at most hourly
MAX_RESULT_LEN = 4000  # truncate a stored run result


class ScheduledTaskIn(BaseModel):
    """A schedule as submitted by the client."""

    name: str = Field(min_length=1, max_length=80)
    prompt: str = Field(min_length=1, max_length=4000)
    cron: str = Field(min_length=1, max_length=120)
    enabled: bool = True


def is_valid_cron(expr: str) -> bool:
    try:
        return bool(croniter.is_valid(expr))
    except Exception:  # noqa: BLE001
        return False


def next_run(cron: str, after: datetime | None = None) -> datetime:
    """The next fire time at/after ``after`` (default now), in UTC."""
    base = after or datetime.now(timezone.utc)
    return croniter(cron, base).get_next(datetime)


def interval_ok(cron: str, min_seconds: int = MIN_INTERVAL_SECONDS) -> bool:
    """Reject schedules that EVER fire less than ``min_seconds`` apart (cost guard).

    Scans many consecutive fires from a FIXED base (not ``now``) and checks the minimum
    gap across the whole cycle — so a 'burst' cron (e.g. fires 6× at the top of the hour,
    then idles) can't slip past by being submitted during its idle window.
    """
    try:
        base = datetime(2024, 1, 1, tzinfo=timezone.utc)  # fixed → submission-time independent
        it = croniter(cron, base)
        prev = it.get_next(datetime)
        for _ in range(200):  # cover dense within-day clusters
            cur = it.get_next(datetime)
            if (cur - prev).total_seconds() < min_seconds:
                return False
            prev = cur
        return True
    except Exception:  # noqa: BLE001
        return False
