#!/usr/bin/env python3
"""Run Eve evals against MiniScira production as the eval account."""

from __future__ import annotations

import json
import os
import pathlib
import socket
import subprocess
import sys
import time
import urllib.request
from typing import Any, cast

STACK_ID = 30
EVAL_USER_ID = "miniscira-eval-user"
FORWARD_HOST = "127.0.0.1"
FORWARD_PORT = 8325
TARGET_HOST = "10.21.0.1"
TARGET_PORT = 8325


def load_env() -> None:
    for filename in ("/opt/data/.env", "/opt/data/profiles/miniscira/.env"):
        path = pathlib.Path(filename)
        if not path.exists():
            continue
        for raw in path.read_text(errors="ignore").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def stack_environment() -> dict[str, str]:
    base = os.environ.get("PORTAINER_URL", "http://10.21.0.1:9000").rstrip("/")
    token = os.environ.get("PORTAINER_API_TOKEN") or os.environ.get("PORTAINER_TOKEN")
    if not token:
        raise RuntimeError("Portainer token unavailable")
    request = urllib.request.Request(
        f"{base}/api/stacks/{STACK_ID}", headers={"X-API-Key": token}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        stack = cast(dict[str, Any], json.load(response))
    return {
        cast(str, item["name"]): cast(str, item.get("value", ""))
        for item in cast(list[dict[str, Any]], stack.get("Env", []))
    }


def wait_for_forward(process: subprocess.Popen[bytes]) -> None:
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("eval forward exited before becoming ready")
        try:
            with socket.create_connection((FORWARD_HOST, FORWARD_PORT), timeout=0.25):
                return
        except OSError:
            time.sleep(0.1)
    raise RuntimeError("eval forward did not become ready")


def eve_arguments(arguments: list[str]) -> list[str]:
    result = [
        "/opt/data/bin/bun",
        "./node_modules/eve/bin/eve.js",
        "eval",
        "--url",
        f"http://{FORWARD_HOST}:{FORWARD_PORT}",
    ]
    if "--strict" not in arguments:
        result.append("--strict")
    if "--max-concurrency" not in arguments:
        result.extend(["--max-concurrency", "1"])
    return [*result, *arguments]


def main() -> int:
    load_env()
    deployment_env = stack_environment()
    eval_token = deployment_env.get("EVE_EVAL_AUTH_TOKEN")
    eval_user_id = deployment_env.get("EVE_EVAL_USER_ID")
    if not eval_token:
        raise RuntimeError("Stack 30 has no EVE_EVAL_AUTH_TOKEN")
    if eval_user_id != EVAL_USER_ID:
        raise RuntimeError("Stack 30 EVE_EVAL_USER_ID does not match the fixture account")

    subprocess.run(
        [sys.executable, "scripts/prepare-thread-search-evals.py"], check=True
    )

    runner_env = os.environ.copy()
    runner_env["EVE_EVAL_AUTH_TOKEN"] = eval_token
    forward_env = runner_env.copy()
    forward_env.update(
        {
            "MINISCIRA_EVAL_FORWARD_PORT": str(FORWARD_PORT),
            "MINISCIRA_EVAL_TARGET_HOST": TARGET_HOST,
            "MINISCIRA_EVAL_TARGET_PORT": str(TARGET_PORT),
        }
    )
    forward = subprocess.Popen(
        ["/opt/data/bin/bun", "scripts/eval-forward.mjs"],
        env=forward_env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        wait_for_forward(forward)
        completed = subprocess.run(eve_arguments(sys.argv[1:]), env=runner_env)
        return completed.returncode
    finally:
        forward.terminate()
        try:
            forward.wait(timeout=5)
        except subprocess.TimeoutExpired:
            forward.kill()
            forward.wait()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"production eval setup failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
