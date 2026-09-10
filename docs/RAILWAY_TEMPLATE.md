# Railway template: MiniScira

One Railway project with two services. No per-deploy source changes — a
template deploy reaches a working app by setting variables only.

## Services

| Service | Source | Notes |
|---|---|---|
| `app` | This repository, root `Dockerfile` (`railway.toml` in repo root) | Listens on `PORT` (Railway injects it). Health check path `/api/health` on the runtime port; full readiness also covers `/eve/v1/health`. |
| `postgres` | `pgvector/pgvector:pg16` image | Enable the `vector` and `pg_trgm` extensions. Attach persistent storage for the data directory. |

## Volumes

| Mount | Service | Purpose |
|---|---|---|
| Postgres data directory | `postgres` | Database rows survive redeploys. |
| `/data/uploads` | `app` | Must equal `LOCAL_STORAGE_DIR` so uploads survive redeploys. |

## Variables (`app` service)

| Variable | Value | Where to find it |
|---|---|---|
| `DATABASE_URL` | Private-network reference to the `postgres` service (e.g. `${{postgres.DATABASE_URL}}`) | Railway service reference; never a public host. |
| `AI_GATEWAY_BASE_URL` | `https://openrouter.ai/api/v1` | Fixed default for OpenRouter. |
| `AI_GATEWAY_API_KEY` | Shared OpenRouter key | OpenRouter dashboard; never commit it. |
| `ALLOW_SHARED_GATEWAY_KEY` | `true` | Fixed; lets turns run on the shared key when the user holds no saved key. |
| `DEFAULT_CHAT_MODEL` | One OpenRouter model ID served by the endpoint (first default: `nex-agi/nex-n2.5-pro:free`, a free text and image input model with tool calls and a 262K window) | OpenRouter catalog; keep in agreement with the `NEXT_PUBLIC_DEFAULT_CHAT_MODEL` build value. |
| `BETTER_AUTH_SECRET` | Generated secret | Generate with `openssl rand -base64 32` or the template secret function. |
| `BETTER_AUTH_URL` | Railway public origin (e.g. `https://<service>.up.railway.app`) | Generated public domain for the `app` service. |
| `APP_URL` | Same public origin as `BETTER_AUTH_URL` | Same as above. |
| `LOCAL_STORAGE_DIR` | `/data/uploads` | Fixed; must match the uploads volume mount path. |

Optional OpenRouter attribution (sent as `HTTP-Referer` / `X-Title` only when set):

| Variable | Purpose |
|---|---|
| `OPENROUTER_HTTP_REFERER` (or `APP_URL`) | Referer header identifying the app. |
| `OPENROUTER_X_TITLE` | Title header identifying the app. |

## Boot order

The entrypoint requires `DATABASE_URL`, waits for the database, applies the
committed migrations in `lib/db/migrations/` idempotently (repeat runs change
nothing), then supervises Eve and Next. `RUN_DB_PUSH` is never the routine
path — it stays gated for adopted stacks only.

## Verify

1. `GET /api/health` returns 200 on the Railway domain.
2. `GET /eve/v1/health` returns ready on the Railway domain.
3. The model catalog loads from OpenRouter; one chat turn streams on the
   shared key with no per-user key.
4. Code tool calls return a clear unavailable message and the turn continues.
