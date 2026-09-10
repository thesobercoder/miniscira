# PRD: Railway hosting with OpenRouter default

- **Status:** To do
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-railway-hosting)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Not approved

## Goal

Ship MiniScira as a native Railway deployment with OpenRouter as the default provider. Any operator can deploy it from this repository or from a Railway template with no per-deploy source changes.

A deployment is one Railway project with one app service and one Postgres service. The app builds from the root `Dockerfile`. The database runs a pgvector image. Uploads persist on a Railway volume. All model traffic goes through OpenRouter through `AI_GATEWAY_BASE_URL`. The provider catalog work stays in the linked provider PRD.

Related provider work: [Configurable model providers and workload models](./prd-configurable-model-providers-and-workloads.md). That PRD owns the OpenRouter adapter, the administrator catalog, workload defaults, and capability rules. This PRD owns the Railway platform fit and wires the Railway deployment to that contract. Neither PRD duplicates the other.

Current state blocks this goal. No `railway.json` or `railway.toml` exists. No code reads `process.env.PORT`. `scripts/entrypoint.mjs` starts Next on port 3000 and the image health check probes `localhost:3000`. `lib/gateway-models.ts` reports `200_000` for every model. `lib/gateway.ts` sends no OpenRouter attribution headers. `agent/sandbox.ts` requires a Docker backend with no fallback.

## User stories

- As an operator, I can create a Railway project from this repository and reach a running app.
- As an operator, I can deploy the same result from a published Railway template by setting variables only.
- As an operator, I can set OpenRouter once and serve chat, research, compaction, and the model catalog on it.
- As a user, I can sign in on the public Railway URL and run a long research chat.
- As a template user, I can see what each variable does and where to find its value.

## Scope

1. Railway app service built from the root `Dockerfile`. No Compose services run on Railway.
2. Railway Postgres service from a pgvector image with `vector` and `pg_trgm` enabled.
3. Railway volume for uploads mounted at `LOCAL_STORAGE_DIR` (`/data/uploads`).
4. Railway environment matrix: `DATABASE_URL`, `AI_GATEWAY_BASE_URL`, `AI_GATEWAY_API_KEY`, `ALLOW_SHARED_GATEWAY_KEY`, `DEFAULT_CHAT_MODEL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_URL`. Secrets use template variable functions. `DATABASE_URL` uses a private-network reference.
5. `PORT` handling. The app listens on `PORT` when Railway sets it and keeps `3000` as the local default.
6. Railway health check on the runtime port. Full readiness covers both `/api/health` and `/eve/v1/health`.
7. Idempotent schema setup on Railway from committed migrations in `lib/db/migrations/`. No Compose one-shot service and no routine `RUN_DB_PUSH`.
8. OpenRouter default wiring: `AI_GATEWAY_BASE_URL=https://openrouter.ai/api/v1`, shared OpenRouter key, one default chat model served by OpenRouter, attribution headers when configured, verified context window per model, `provider/model` IDs through the catalog.
9. Graceful sandbox behavior on Railway. Code execution fails with a clear message and never hangs a turn.
10. A Railway template definition with services, volumes, variables, descriptions, and health checks.
11. Proof of one long conversation on Railway with early, middle, and recent facts across two compactions.

## Non-goals

- No Umbrel, Portainer, Docker-socket middleware, or Squid egress work in this PRD.
- No sibling-container sandbox on Railway.
- No administrator model catalog UI in this PRD. That UI stays in the linked provider PRD.
- No multi-provider router inside MiniScira in this PRD.
- No automatic scaling, multi-region, or cost optimization.
- No email delivery or Lookout schedule changes.
- No change to the Eve `auth:` chain order in `agent/channels/eve.ts`.

## Functional requirements

1. A fresh Railway project builds the root `Dockerfile` with no local patches.
2. The app serves the public Railway domain over HTTPS.
3. Sign-in, chat send, streaming, retry, reload, and restart work on that domain.
4. The model catalog loads from OpenRouter through `AI_GATEWAY_BASE_URL`.
5. Ordinary turns run on the shared OpenRouter key when `ALLOW_SHARED_GATEWAY_KEY=true` and the user holds no saved key.
6. A user-saved gateway key still bills that user's turns where the provider policy allows it.
7. Uploads survive redeploys through the attached volume.
8. Database rows survive redeploys through the Postgres service storage.
9. Sandbox tool calls return a clear unavailable message and the turn continues or ends honestly. No hang.
10. A template deploy reaches the same running state by setting variables only.
11. No secret appears in code, logs, diffs, or docs.

## Technical requirements

### Configuration

- Set `AI_GATEWAY_BASE_URL` to `https://openrouter.ai/api/v1`.
- Set `AI_GATEWAY_API_KEY` to the shared OpenRouter key. Never commit it.
- Set `ALLOW_SHARED_GATEWAY_KEY=true` for shared test and template use.
- Set `DEFAULT_CHAT_MODEL` to one OpenRouter model ID served by that endpoint. Keep the runtime value and the `NEXT_PUBLIC_DEFAULT_CHAT_MODEL` build value in agreement.
- Set `BETTER_AUTH_URL` and `APP_URL` to the Railway public origin.
- Set `BETTER_AUTH_SECRET` from `openssl rand -base64 32`.
- Set `DATABASE_URL` from the Postgres service private-network reference.
- Keep `LOCAL_STORAGE_DIR` and the Railway volume mount path identical.

### Platform changes

- Read the runtime port from `PORT` when present in `scripts/entrypoint.mjs` and the Next start path. Keep `3000` as the local default.
- Probe readiness on the runtime port in the image `HEALTHCHECK` and in Railway health check config. Cover `/api/health` for deploy routing and `/eve/v1/health` for full readiness.
- Keep the entrypoint order. Require `DATABASE_URL`, wait for the database, apply committed migrations idempotently, then supervise Eve and Next.
- Replace the Compose one-shot `migrate` service with an idempotent boot step that runs `scripts/migrate.mjs` logic against `lib/db/migrations/`. Repeat runs change nothing.
- Do not use `RUN_DB_PUSH=true` as the routine Railway path. It runs `drizzle-kit push --force`, which is diff-and-apply and not versioned.
- Fix loopback assumptions that break on a non-3000 port. This includes staged-upload fetch in `agent/tools/run_code.ts` and base URL fallbacks in `lib/base-url.ts`.
- Return a clear sandbox-unavailable result from the sandbox path when no Docker backend exists. Add the catch that `agent/tools/run_code.ts` lacks today.

### OpenRouter linkage

- This PRD consumes the provider contract in the linked provider PRD. It does not reimplement it.
- Send OpenRouter attribution headers (`HTTP-Referer`, `X-Title`) when configured. Do not require them for generic gateways. `lib/gateway.ts` sends none today.
- Replace the universal `200_000` assumption with the selected OpenRouter model's verified context limit. `lib/gateway-models.ts` hardcodes `DEFAULT_CONTEXT_WINDOW = 200_000` and `agent/agent.ts` hardcodes `modelContextWindowTokens: 200_000` for both the fallback window and compaction. Compaction timing must follow the verified per-model value from `contextWindowFor`.
- Accept OpenRouter `provider/model` IDs end to end. `lib/models.ts` assumes bare CLIProxyAPI IDs today, so `providerOf` and `NON_CHAT_MODELS` need OpenRouter coverage and text-only models must stay out of the chat picker.
- Keep per-turn credential resolution in `agent/agent.ts`. Compaction reuses the active turn model and its resolved credential. No separate compaction credential path.
- Keep `imageModel` working on the shared key path. Per-user image billing stays out of scope here.

### Template definition

- Define one template with two services: the app from this repository and Postgres from a pgvector image.
- Attach a Postgres data volume and an app uploads volume at `/data/uploads`.
- Declare every required variable with a plain description and where to find the value.
- Generate `BETTER_AUTH_SECRET` and Postgres credentials with template variable functions. Never ship default credentials.
- Reference `DATABASE_URL` from the Postgres service private domain, not a public host.
- Set the Railway health check path to `/api/health` on the runtime port.
- Follow the Railway template best practices for naming, icons, private networking, and persistent storage.

### Test plan

- `bun run typecheck` passes.
- `bun run lint` passes.
- `bun test` passes, including `lib/conversation-checkpoint.test.ts`, `lib/conversation-compaction.test.ts`, `lib/bootstrap-envelope.test.ts`, `hooks/use-eve-chat.test.ts`, and `evals/long-conversation-checkpoint.test.ts`.
- `python3 scripts/check-task-docs.py` passes.
- Production build from the root `Dockerfile` passes.
- Migration check passes on a fresh pgvector database and on repeat runs.
- Sandbox-unavailable unit tests prove a clear message and no hang.
- `PORT` tests prove the app listens and probes on the injected port.

### Eval and acceptance plan

- Evals apply because this changes provider, deployment, and long-conversation verification.
- Run the deterministic long-conversation fixture with unique early, middle, and recent facts.
- Force at least two compaction cycles on the Railway deployment.
- Check recall after continuous compaction, browser reload, app restart, branch, retry, edit, and replacement-session rebuild.
- Run one ordinary chat, one tool call, one image attachment turn, and one Lookout where enabled.
- Run the OpenRouter production acceptance in the linked provider PRD against the Railway deployment. That includes catalog load, chat stream, image input, tool calls, structured output, two compaction cycles on the retention fixture, and artifact generation where enabled.

## Acceptance criteria

- [ ] Railway builds the root `Dockerfile` without local patches.
- [ ] The app listens on `PORT` and the Railway health check passes.
- [ ] `GET /api/health` returns 200 on the Railway domain.
- [ ] `GET /eve/v1/health` returns ready on the Railway domain.
- [ ] The model catalog loads from OpenRouter.
- [ ] Ordinary chat streams on the shared OpenRouter key with no per-user key.
- [ ] Compaction timing follows the selected OpenRouter model's verified context limit.
- [ ] A long thread preserves early, middle, and recent facts across two compactions.
- [ ] Facts survive reload, restart, branch, retry, edit, and replacement-session rebuild.
- [ ] Uploads survive a redeploy.
- [ ] Database rows survive a redeploy.
- [ ] Repeat migration runs change nothing.
- [ ] Sandbox calls fail clearly and do not hang the turn.
- [ ] A template deploy reaches a working app by setting variables only.
- [ ] No secret appears in code, logs, diffs, or docs.

## Deployment

Deploy as two Railway services in one project:

1. Provision Postgres from a pgvector image. Attach persistent storage. Enable `vector` and `pg_trgm`.
2. Deploy the app from the repository with the root `Dockerfile`.
3. Attach an app volume at `LOCAL_STORAGE_DIR`.
4. Set the required environment values. Generate a public domain. Use private-network references for service-to-service values.
5. Apply committed migrations idempotently at boot. Verify with a second run that changes nothing.
6. Verify both health endpoints, one chat turn, catalog load, and the long-thread fixture.
7. Publish the template only after a scratch project passes every acceptance check.
8. Use a scratch Railway project before changing a shared test project.

## Observability

- Deploy logs show database wait, migration result, Eve start, Next start, and provider catalog errors without secrets.
- Record provider ID, model ID, workload, status, latency, token use, and cost when available. Do not record keys, headers, prompt bodies, or file bytes.
- Expose last catalog refresh, invalid workload assignment, removed models, and compaction fallback use.

## Rollback

1. Keep the previous Railway deployment and database snapshot before each change.
2. Roll back by redeploying the previous image and restoring `AI_GATEWAY_BASE_URL`, `AI_GATEWAY_API_KEY`, `DEFAULT_CHAT_MODEL`, and `BETTER_AUTH_URL` from the pre-change snapshot.
3. Verify health, catalog, one chat turn, and one tool call.
4. No chat data migration is required for a provider rollback. Restore the database only when a migration changed the schema.

## Open questions

- Which OpenRouter chat model is the first default?
- Which OpenRouter compaction path carries the checkpoint summaries when the turn model differs?
- Should the template pin one OpenRouter model or offer a small tested set?
- How does invite-only signup interact with the first Railway administrator?
