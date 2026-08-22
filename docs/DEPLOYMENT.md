# MiniScira — Deployment & Operations Runbook

Operational companion to the README quickstart. Everything here applies to
self-hosted Docker Compose deployments of this repository. The compose file
ships the full stack: app image, bundled Postgres + pgvector, a one-shot
migration service, named volumes, and healthchecks. External/managed Postgres
is supported via the `docker-compose.external-db.yml` override.

For Soham's concrete Umbrel/Portainer Stack 30 deployment—including the direct
Docker-socket middleware, Squid egress policy, image IDs, scratch/production
acceptance gates, upstream-sync policy, UI-stall diagnosis, and rollback—use
[`docs/UMBREL_SANDBOX_OPERATIONS.md`](./UMBREL_SANDBOX_OPERATIONS.md) as the
canonical operator runbook.

> **One-line rule**: deployment configuration is environment-driven. Every
> model call goes through the mandatory `AI_GATEWAY_BASE_URL`, with no baked-in
> gateway fallback. See the matrix below for the other required settings.

## Quickstart

```bash
git clone https://github.com/thesobercoder/miniscira.git && cd miniscira
cp .env.example .env          # fill in the REQUIRED values (below)
docker compose build
docker compose up -d db
docker compose --profile migrate run --rm migrate   # apply schema once
docker compose up -d app
curl http://localhost:3000/api/health               # {"ok":true}
```

If you already have a database (e.g. you are adopting a running stack), still
run the migrate step once — the service detects the existing schema and
**stamps** the committed migrations as applied without executing DDL
(baseline adoption).

## Environment matrix

`REQUIRED` variables are validated at application startup
(`lib/env-check.ts`): the app fails fast with a clear error when one is
missing. Everything else is optional — off or defaulted unless set.

### REQUIRED

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. The database MUST have pgvector — the bundled `db` service (`pgvector/pgvector:pg16`) includes it. With the compose file, the host is `db` and `POSTGRES_PASSWORD` must match the password in this URL. |
| `AI_GATEWAY_BASE_URL` | Any OpenAI-compatible endpoint (`http://gateway:8000/v1` on the compose network, a LAN host, or a remote `https://…/v1`). All AI traffic — chat, tools, images, the model catalog — goes here. No fallback. |
| `BETTER_AUTH_SECRET` | Auth secret: `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | Browser-facing public origin of the app, such as `http://localhost:3000`, a LAN URL, or the external HTTPS URL behind a reverse proxy. |
| `POSTGRES_PASSWORD` | Read by compose from ITS interpolation environment (the root `.env`), not the app's `env_file`. Must match `DATABASE_URL`. |

### OPTIONAL (the ones that matter most)

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Public origin for absolute links; defaults to `BETTER_AUTH_URL`. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Extra origins better-auth accepts callbacks from, comma-separated (e.g. a LAN IP alongside the hostname). |
| `AI_GATEWAY_API_KEY` | Shared gateway key for the shared-key path and the model catalog. Users may instead save their own key in Settings (sealed at rest). |
| `ALLOW_SHARED_GATEWAY_KEY` | `"true"` lets users without their own saved key fall back to `AI_GATEWAY_API_KEY`. LAN/single-household deployments should set this. |
| `DEFAULT_CHAT_MODEL` | Default chat model when the user has not picked one. Optional override; the built-in default applies when unset. See “Model configuration”. |
| `AI_MODELS_JSON` | Metadata-ONLY overrides for the model picker. See “Model configuration”. |
| `IMAGE_MODEL` | Image model for the `generate_image` tool (default `gpt-image-2`). |
| `LOCAL_STORAGE_DIR` | Where uploads land (`/data/uploads`; the compose mounts a named volume there). |
| `RUN_DB_PUSH` | TRANSITIONAL: `"true"` runs `drizzle-kit push` at container start under a Postgres advisory lock. Default off — normal startup never mutates the schema. |
| `EXA_API_KEY`, `FIRECRAWL_API_KEY`, `FIRECRAWL_API_URL`, `XAI_API_KEY`, `SEARXNG_URL` | Search providers — the agent's only web access. `reddit_search` uses `SEARXNG_URL` with `site:reddit.com` queries. With none set, the agent cannot reach the web. |
| `LOOKOUT_RUN_SECRET` | Secret for scheduled-research internal auth: `openssl rand -hex 32`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `LOOKOUT_EMAIL_FROM`, `LOOKOUT_EMAIL_TO` | Optional SMTP delivery for Lookout results. SMTP is preferred over Resend when fully configured. `LOOKOUT_EMAIL_TO` overrides the owner's profile email as the digest recipient. |
| `RESEND_API_KEY` | Optional fallback email transport for Lookout results. |
| `RATE_LIMIT_PER_MINUTE` | Per-user requests/minute on `/api/*` (in-memory, per process). |
| `APP_PORT`, `IMAGE_PLATFORM`, `MINISCIRA_IMAGE` | Compose/build knobs. `APP_PORT` is the published host port (default `3000`). |
| `DEMO_MODE` | `"true"` serves a landing page instead of the app. Leave unset when self-hosting. |

The full matrix with inline comments lives in `.env.example` — it is the
single source of truth for deployment configuration.

## Database & migrations

- **Committed migrations are the contract.** Schema changes live in
  `lib/db/migrations/` (Drizzle journal + SQL). Apply them once with the
  one-shot service:
  ```bash
  docker compose --profile migrate run --rm migrate
  ```
  The `migrate` profile keeps the service out of `docker compose up` — normal
  startup never runs `db:push` and never mutates the schema.
- **Fresh installs** get the full schema from the committed SQL (the service
  also creates the pgvector extension if missing).
- **Adopted databases** (an existing schema from the pre-migration era) are
  detected: the migrations are **stamped as applied without executing DDL**.
  The stamping is recorded in `drizzle.__drizzle_migrations`; your data,
  tables, and constraints are untouched.
- **`RUN_DB_PUSH`** is the transitional alternative for stacks that still want
  push-at-boot. It runs `drizzle-kit push` under a Postgres advisory lock
  (only one instance wins; others skip) before the app starts. Keep it off
  unless you specifically need it.
- **External Postgres**: use the override (Compose v2.20+):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.external-db.yml build
  docker compose -f docker-compose.yml -f docker-compose.external-db.yml \
    --profile migrate run --rm migrate
  docker compose -f docker-compose.yml -f docker-compose.external-db.yml up -d app
  ```
  It removes the bundled `db` service and requires `DATABASE_URL` to point at
  your own pgvector-capable database (Neon, Supabase, RDS, vanilla + vector
  extension). First-time setup on a fresh external database:
  `bun run db:setup` (creates the vector extension once), then the migrate
  service.

## Model configuration

- **The live gateway catalog is authoritative.** The model picker is built
  from `GET {AI_GATEWAY_BASE_URL}/models` at runtime. Nothing in this
  repository can add or force a model the gateway does not serve.
- **`AI_MODELS_JSON`** (optional) is metadata only — display names, hints,
  ordering, hiding. It never widens availability. Schema-validated at boot
  (zod): a malformed value fails startup, and the container entrypoint runs a
  coarse pre-flight so a bad value takes the container down at the gate with a
  clear error instead of silently degrading. Supported per-model keys:
  `name`, `hint`, `hidden`, `order`, `capabilities` (`{ vision?, fileInput? }`).
  Example:
  ```bash
  AI_MODELS_JSON='{"gpt-5.6-sol":{"name":"Sol (MoA)","order":1,"hint":"Flagship"}}'
  ```
- **`DEFAULT_CHAT_MODEL`** (optional) overrides the default chat model
  (composer default, turn fallback, researcher subagent). The model id must be
  served by the gateway; a default it does not serve logs a startup warning
  (non-fatal) rather than silently working. Server-side resolution reads this
  variable at **runtime**; the client picker's initial selection is baked at
  **image build time** via the `DEFAULT_CHAT_MODEL` build arg
  (`NEXT_PUBLIC_DEFAULT_CHAT_MODEL`). Changing the env after build updates the
  server default without a rebuild; changing the client default needs a
  rebuild.
- **`IMAGE_MODEL`** selects the image model for `generate_image`. Whether the
  gateway supports images depends on its backend; the tool reports failure
  gracefully when it does not.

## Health & readiness

- `GET /api/health` — the Next.js app is up AND the database responds
  (`SELECT 1`). `{"ok":true}`.
- `GET /eve/v1/health` — the agent runtime is ready
  (`{"ok":true,"status":"ready",…}`).
- The compose `healthcheck` probes **both** endpoints, so a dead eve still
  fails readiness. Cold starts are slow (Next boot + eve start, eve itself
  allows up to 60s to production health) — the healthcheck's `start_period`
  is 60s; do not mark the container unhealthy during boot.

## Supervision & process model

The app runs **two processes that behave like one**: the Next.js server
(`:3000`) and the eve agent runtime (`:4274`), with `/eve/v1/*` rewritten from
the app to the agent so the browser sees a single origin (no CORS).

The container entrypoint (`scripts/entrypoint.mjs`) orchestrates startup:

1. Require `DATABASE_URL`, run the coarse `AI_MODELS_JSON` pre-flight (fail
   fast with a clear error).
2. Wait for the database (`DB_WAIT_TIMEOUT_MS`, default 90s).
3. Run the gated `RUN_DB_PUSH` step if enabled (advisory lock).
4. Start both processes **under supervision** (`scripts/supervise.mjs`):
   - wait for **either direct child to exit**;
   - on exit, terminate the survivor, propagate the exit code, and exit the
     container.

Because the container exits when either half dies, `restart: unless-stopped`
brings it back — a crashed eve restarts the whole container in seconds. The
compose file sets `init: true` (real PID 1 / tini), so termination signals are
forwarded and zombies reaped. **Restart behavior is measured with
`RestartCount` and `StartedAt`**: `unless-stopped` reuses the same container
ID across restarts.

## Storage & volumes

- `miniscira-db` — Postgres data (`/var/lib/postgresql/data`). All users,
  chats, sessions, lookouts, and vector data live here.
- `miniscira-uploads` — files in `LOCAL_STORAGE_DIR` (`/data/uploads`),
  served by the app at `/api/files/*`.
- **Adopting existing volumes**: the compose stack works against volumes
  created by earlier deployments — bring the stack up on the same volume
  names and the data is used in place (no data movement). When adopting a
  pre-migration-era database, run the migrate service once to stamp the
  baseline (no DDL).

## Backups & restore

Back up the database and the uploads volume. Both are needed for a full
restore.

```bash
# database (logical dump; run against the db container or your external PG)
docker compose exec -T db pg_dump -U miniscira -d miniscira -Fc -f /tmp/miniscira.dump
docker compose cp db:/tmp/miniscira.dump ./miniscira-$(date +%F).dump

# uploads
docker run --rm -v miniscira_uploads:/data -v "$PWD":/backup \
  alpine tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

Restore:

```bash
docker compose down
# fresh database volume, then:
docker compose up -d db
docker compose cp ./miniscira-YYYY-MM-DD.dump db:/tmp/restore.dump
docker compose exec -T db sh -c 'createdb -U miniscira miniscira_restore && pg_restore -U miniscira -d miniscira_restore /tmp/restore.dump'
# point DATABASE_URL at the restored database (or drop/rename to miniscira)
docker compose up -d
# uploads:
docker run --rm -v miniscira_uploads:/data -v "$PWD":/backup \
  alpine tar xzf /backup/uploads-YYYY-MM-DD.tar.gz -C /data
```

A restore into a fresh database requires the pgvector extension: either use
the bundled `db` service (it includes pgvector) or run
`CREATE EXTENSION IF NOT EXISTS vector;` first.

## Upgrades & rollback

Upgrade path:

1. Back up first (above).
2. Pull/build the new image: `docker compose build` (or `docker compose pull`
   when using a registry image).
3. `docker compose up -d` — recreates the app container on the new image.
4. Apply any new committed migrations: `docker compose --profile migrate run --rm migrate`.
5. Verify: `curl localhost:${APP_PORT}/api/health` and
   `/eve/v1/health` both return 200.

Rollback: keep the previous image tag around (do not delete it), then:

```bash
# point MINISCIRA_IMAGE at the previous tag in .env (or edit the compose),
# then recreate:
docker compose up -d --force-recreate
```

Because the stack uses named volumes and the previous image is retained,
rolling back does not touch data. If the upgrade ran new migrations, restore
the pre-upgrade backup before rolling back the code.

## Secrets

- **Never commit secrets.** `.env` is the deployment's secret store; it is
  gitignored. `cp .env.example .env` and fill it in.
- Generate with: `openssl rand -base64 32` (auth) / `openssl rand -hex 32`
  (lookout run secret).
- **Rotation**: rotating `BETTER_AUTH_SECRET` invalidates existing sessions —
  users must sign in again. Rotating `AI_GATEWAY_API_KEY` only affects users
  on the shared key (users with their own saved key are unaffected).
  Restart the app after rotating anything (`docker compose up -d`).
- User-saved gateway keys are sealed at rest (`lib/secret-box.ts`).
- File permissions: keep `.env` owner-readable only (`chmod 600 .env`).

## Reverse proxy (public deployments)

- Set `BETTER_AUTH_URL` (and optionally `APP_URL`) to the **external** origin
  — e.g. `https://miniscira.example.com` — not `localhost`.
- Add the LAN IP / alternate hostnames to `BETTER_AUTH_TRUSTED_ORIGINS`
  (comma-separated) so better-auth accepts callbacks from them.
- The proxy must forward the standard `X-Forwarded-*` headers so the app
  builds correct absolute links behind the proxy.
- Publish on the LAN via `APP_PORT` (default `3000`); terminate TLS at the
  proxy.

## Gateway capability surfaces

The app depends on an OpenAI-compatible endpoint. Capabilities are exercised
**independently** — a gateway may support some and not others:

- **chat / streaming** — required for agent turns.
- **tools (function calling)** — required for the researcher subagent and
  tool-using turns.
- **images** — only for the `generate_image` tool (`IMAGE_MODEL`); the tool
  fails gracefully when the gateway has no images endpoint.
- **model catalog** (`GET /v1/models`) — drives the picker. A gateway without
  a working catalog endpoint yields an empty picker (metadata can label, but
  cannot invent, models).

## Firecrawl & search (degraded mode)

- The agent's only web access is the search tools: Exa, Firecrawl,
  xAI (X search), You.com (Reddit). With none configured, the agent cannot
  reach the web — chat still works.
- **Self-hosted Firecrawl**: point `FIRECRAWL_API_URL` at it (e.g.
  `http://firecrawl:3002` on the compose network, or a LAN host). When the
  Firecrawl API is unreachable or rate-limited, search/scrape tools report
  the failure and the turn continues — research quality degrades, the app
  does not crash.

## Sandbox & platform notes

- **The sandbox uses Eve's Docker backend** through a private Docker-API
  middleware sidecar. On the validated Umbrel deployment, only that middleware
  mounts Portainer's Engine socket (`/data/docker.sock` on the host,
  `/var/run/docker.sock` inside the middleware). MiniScira receives only
  `DOCKER_HOST`; it gets neither the raw socket nor a Portainer token. The
  Portainer endpoint proxy is intentionally not in the attached-exec data path:
  it did not preserve Docker's required upgraded bidirectional stream. Each
  session runs as a sibling container attached only to `sandbox-egress`,
  separate from `docker-control`; HTTP(S) is injected through the
  internal `sandbox-egress-proxy`. Its Squid domain ACL permits npm, PyPI, Go,
  Rust, GitHub, Node, Bun, Deno/JSR, and GitLab distribution hosts and denies
  everything else. This is not DinD and neither private proxy publishes a LAN
  port. The middleware is default deny and validates Sandbox labels, images,
  networks, container options, resource ownership, Exec, archive, Template
  commit, and cleanup operations.
- **Critical stream invariant**: Sandbox file writes use an attached Docker Exec
  upload. The middleware must forward both directions concurrently and send EOF
  toward Docker when the client upload finishes. A regression leaves the Agent
  UI busy and a Sandbox process stuck at `cat > /workspace/main.py`. Every
  middleware release must test `writeTextFile` followed by code execution; a
  spawn-only smoke test is insufficient.
- **Platform**: the image builds `linux/amd64` — the only natively supported
  arch, because `@firecrawl/pdf-inspector` ships no Linux ARM64 NAPI binding.
  ARM64 hosts build and run under emulation (`IMAGE_PLATFORM` keeps build and
  runtime in sync); expect slower builds.

## Resource guidance (light)

A household/LAN deployment (app + eve + bundled Postgres) is comfortable on
~2 vCPU / 4 GB RAM. Research turns are the load driver — memory usage grows
with long transcripts and parallel sub-agent work; give the container headroom
if you run many simultaneous users. The uploads volume grows with file
attachments; the Postgres volume grows with chats and vector embeddings.

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Container restart loop at boot | Bad `DATABASE_URL`, unreachable DB past `DB_WAIT_TIMEOUT_MS`, or malformed `AI_MODELS_JSON` (entrypoint pre-flight exits 1 with the reason in logs). |
| `/api/health` 500 | DB unreachable from the app, or Next failed to boot (check `docker compose logs app`). |
| Container healthy but eve restarting | A crashed eve kills the whole container by design (supervision) — `RestartCount` increments, `StartedAt` refreshes; check eve logs before the exit. |
| Picker shows no/odd models | Gateway `/v1/models` empty or unreachable — the catalog is authoritative; `AI_MODELS_JSON` cannot add models. |
| Model 404s at turn time | `DEFAULT_CHAT_MODEL` or a user-chosen model is not served by the gateway — check the startup warning. |
| Auth callbacks rejected | `BETTER_AUTH_URL` / `BETTER_AUTH_TRUSTED_ORIGINS` mismatch behind a proxy. |
| Agent cannot search the web | No search provider keys configured (Exa/Firecrawl/xAI/You.com). |

See also `AGENTS.md` for code-level invariants, and `SECURITY.md` for
reporting vulnerabilities.
