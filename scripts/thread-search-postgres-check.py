#!/usr/bin/env python3
"""Run the Phase 1 thread-search migration/query checks via Portainer exec.

Uses only disposable rows and a disposable schema inside the running PostgreSQL
container. Secrets stay in Portainer/container environment and are never printed.
"""
from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path
from typing import Any, cast

ENV_PATH = Path("/opt/data/.env")
DB_CONTAINER = "miniscira-db-1"
MIGRATION = Path("/opt/data/miniscira-src/lib/db/migrations/0003_thread-search.sql")


def load_env() -> None:
    for raw in ENV_PATH.read_text(errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def request(
    path: str, *, data: bytes | None = None, method: str = "GET"
) -> Any:
    base = os.environ.get("PORTAINER_URL", "http://10.21.0.1:9000").rstrip("/")
    token = os.environ.get("PORTAINER_API_TOKEN") or os.environ.get("PORTAINER_TOKEN")
    endpoint = os.environ.get("PORTAINER_ENDPOINT_ID", "1")
    if not token:
        raise RuntimeError("Portainer token is unavailable")
    req = urllib.request.Request(
        f"{base}/api/endpoints/{endpoint}/docker{path}",
        data=data,
        method=method,
        headers={"X-API-Key": token, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        body = response.read()
        return json.loads(body) if body else None


def container_id() -> str:
    rows = cast(list[dict[str, Any]], request("/containers/json?all=1"))
    for row in rows:
        if DB_CONTAINER in [name.lstrip("/") for name in row.get("Names", [])]:
            return row["Id"]
    raise RuntimeError(f"{DB_CONTAINER} is not running")


def exec_psql(container: str, sql: str) -> str:
    created = cast(
        dict[str, Any],
        request(
            f"/containers/{container}/exec",
            data=json.dumps(
                {
                    "AttachStdout": True,
                    "AttachStderr": True,
                    "Cmd": [
                        "psql",
                        "-v",
                        "ON_ERROR_STOP=1",
                        "-U",
                        "miniscira",
                        "-d",
                        "miniscira",
                        "-X",
                        "-q",
                        "-c",
                        sql,
                    ],
                }
            ).encode(),
            method="POST",
        ),
    )
    exec_id = created["Id"]
    base = os.environ.get("PORTAINER_URL", "http://10.21.0.1:9000").rstrip("/")
    token = os.environ.get("PORTAINER_API_TOKEN") or os.environ.get("PORTAINER_TOKEN")
    if not token:
        raise RuntimeError("Portainer token is unavailable")
    endpoint = os.environ.get("PORTAINER_ENDPOINT_ID", "1")
    req = urllib.request.Request(
        f"{base}/api/endpoints/{endpoint}/docker/exec/{exec_id}/start",
        data=json.dumps({"Detach": False, "Tty": False}).encode(),
        method="POST",
        headers={"X-API-Key": token, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as response:
        raw = response.read()
    # Docker multiplexes non-TTY stdout/stderr in 8-byte frames.
    chunks: list[bytes] = []
    index = 0
    while index + 8 <= len(raw):
        size = int.from_bytes(raw[index + 4 : index + 8], "big")
        chunks.append(raw[index + 8 : index + 8 + size])
        index += 8 + size
    output = b"".join(chunks).decode(errors="replace") if chunks else raw.decode(errors="replace")
    inspected = cast(dict[str, Any], request(f"/exec/{exec_id}/json"))
    if inspected.get("ExitCode") != 0:
        raise RuntimeError(output.strip() or "psql check failed")
    return output


def main() -> int:
    load_env()
    migration = MIGRATION.read_text().replace("--> statement-breakpoint", "")
    container = container_id()
    setup = f"""
DROP SCHEMA IF EXISTS thread_search_check CASCADE;
CREATE SCHEMA thread_search_check;
SET search_path TO thread_search_check, public;
CREATE TABLE chat (
  id uuid PRIMARY KEY,
  user_id text NOT NULL,
  project_id uuid,
  title text NOT NULL,
  updated_at timestamp NOT NULL
);
{migration}
CREATE INDEX chat_scope_idx ON chat (user_id, project_id, updated_at DESC);
INSERT INTO chat (id,user_id,project_id,title,updated_at)
SELECT md5('owned-'||g)::uuid, 'owner-a',
       CASE WHEN g % 2 = 0 THEN '22222222-2222-2222-2222-222222222222'::uuid ELSE NULL END,
       CASE
         WHEN g=1 THEN 'PostgreSQL thread search'
         WHEN g=2 THEN 'Postgres thread searching'
         WHEN g=3 THEN 'Thread picker design'
         ELSE 'Historical research '||g
       END,
       now() - (g||' minutes')::interval
FROM generate_series(1,10000) g;
INSERT INTO chat VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','owner-b',NULL,'PostgreSQL thread search',now()),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','owner-a','33333333-3333-3333-3333-333333333333','PostgreSQL thread search',now());
ANALYZE chat;
"""
    exec_psql(container, setup)
    query = """
SET search_path TO thread_search_check, public;
SET enable_seqscan=off;
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT id,title FROM chat
WHERE user_id='owner-a'
  AND id <> 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid
  AND lower(title) % 'postgresql thread search'
ORDER BY
  similarity(lower(title),'postgresql thread search') DESC,
  updated_at DESC,
  id ASC
LIMIT 8;
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT id,title FROM chat
WHERE user_id='owner-a'
  AND title_search @@ plainto_tsquery('simple','PostgreSQL thread search')
ORDER BY updated_at DESC, id ASC
LIMIT 8;
SELECT string_agg(title, ' | ' ORDER BY title) AS owned_matches
FROM (
 SELECT title FROM chat
 WHERE user_id='owner-a'
   AND title_search @@ plainto_tsquery('simple','PostgreSQL thread search')
 ORDER BY updated_at DESC LIMIT 8
) ranked;
"""
    output = exec_psql(container, query)
    exec_psql(container, "DROP SCHEMA thread_search_check CASCADE;")
    safe_lines = [line for line in output.splitlines() if line.strip()]
    print("POSTGRES THREAD SEARCH CHECK: PASS")
    for line in safe_lines:
        print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
