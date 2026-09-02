#!/usr/bin/env python3
"""Run the dashboard's tiered snapshot refresh jobs without third-party packages."""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CACHE_ROOT = PROJECT_ROOT / ".cache"
STATE_PATH = CACHE_ROOT / "sync-state.json"
LOCK_PATH = CACHE_ROOT / "sync.lock"
REFRESH_SCRIPT = PROJECT_ROOT / "scripts" / "fetch-rpki-data.mjs"

INTERVALS = {
    "fast": int(os.environ.get("SYNC_FAST_MINUTES", "15")) * 60,
    "medium": int(os.environ.get("SYNC_MEDIUM_HOURS", "8")) * 60 * 60,
    "daily": int(os.environ.get("SYNC_DAILY_HOURS", "24")) * 60 * 60,
}
PROFILE_COVERAGE = {
    "fast": ("fast",),
    "medium": ("fast", "medium"),
    "daily": ("fast", "medium", "daily"),
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def load_state() -> dict[str, object]:
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {"completed": {}}


def save_state(state: dict[str, object]) -> None:
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    temporary_path = STATE_PATH.with_suffix(".json.tmp")
    temporary_path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary_path.replace(STATE_PATH)


def completed_timestamp(state: dict[str, object], profile: str) -> float:
    completed = state.get("completed", {})
    if not isinstance(completed, dict):
        return 0.0
    value = completed.get(profile)
    if not isinstance(value, str):
        return 0.0
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


def next_due_profile(state: dict[str, object], now: float) -> str | None:
    for profile in ("daily", "medium", "fast"):
        if now - completed_timestamp(state, profile) >= INTERVALS[profile]:
            return profile
    return None


def seconds_until_next_job(state: dict[str, object], now: float) -> float:
    waits = [max(0.0, completed_timestamp(state, profile) + interval - now) for profile, interval in INTERVALS.items()]
    return min(waits) if waits else 30.0


def run_profile(profile: str, build: bool) -> None:
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    with LOCK_PATH.open("a+", encoding="utf-8") as lock_file:
        try:
            fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError("another snapshot refresh is already running") from error

        print(f"[{utc_now()}] starting {profile} snapshot refresh", flush=True)
        subprocess.run(
            ["node", "--env-file-if-exists=.env", str(REFRESH_SCRIPT), f"--profile={profile}"],
            cwd=PROJECT_ROOT,
            check=True,
        )
        if build:
            subprocess.run(["npm", "run", "build"], cwd=PROJECT_ROOT, check=True)

        completed_at = utc_now()
        state = load_state()
        completed = state.setdefault("completed", {})
        if not isinstance(completed, dict):
            completed = {}
            state["completed"] = completed
        for covered_profile in PROFILE_COVERAGE[profile]:
            completed[covered_profile] = completed_at
        state["lastProfile"] = profile
        state["lastCompletedAt"] = completed_at
        save_state(state)
        print(f"[{completed_at}] completed {profile} snapshot refresh", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Tiered RPKI Dashboard snapshot scheduler")
    parser.add_argument("--once", action="store_true", help="run one profile and exit")
    parser.add_argument("--profile", choices=tuple(INTERVALS), help="profile used with --once")
    parser.add_argument("--no-build", action="store_true", help="refresh JSON without rebuilding dist")
    args = parser.parse_args()

    if args.once:
        profile = args.profile or next_due_profile(load_state(), time.time()) or "fast"
        run_profile(profile, build=not args.no_build)
        return 0
    if args.profile:
        parser.error("--profile requires --once")

    print(
        f"[{utc_now()}] scheduler started: fast={INTERVALS['fast'] // 60}m, "
        f"medium={INTERVALS['medium'] // 3600}h, daily={INTERVALS['daily'] // 3600}h",
        flush=True,
    )
    while True:
        state = load_state()
        profile = next_due_profile(state, time.time())
        if profile:
            try:
                run_profile(profile, build=True)
            except (RuntimeError, subprocess.CalledProcessError) as error:
                print(f"[{utc_now()}] refresh failed: {error}", file=sys.stderr, flush=True)
                time.sleep(300)
            continue
        time.sleep(min(30.0, max(1.0, seconds_until_next_job(state, time.time()))))


if __name__ == "__main__":
    raise SystemExit(main())
