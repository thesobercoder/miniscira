# PRD: Railway hosting with OpenRouter default

- **Status:** To do
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-railway-hosting)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Not approved

## Goal

Host MiniScira on Railway so the team can test and fix long conversations. Use OpenRouter as the default model provider. Keep setup simple and repeatable.

A deployment is a Railway project with one app service and one Postgres service. The app builds from the root `Dockerfile`. The database uses a pgvector image. Uploads persist on a Railway volume.

## User stories

- As an operator, I can deploy MiniScira on Railway from this repository without source changes per deploy.
- As an operator, I can configure OpenRouter once and serve chat, research, and compaction on it.
- As a user, I can sign in through the public Railway URL and run a long research chat.

## Scope

1. Railway app service from the root `Dockerfile`.
2. Railway Postgres service with pgvector and `pg_trgm`.
3. Railway volume for `LOCAL_STORAGE_DIR` (`/data/uploads`).
4. Environment matrix for Railway: `DATABASE_URL`, `AI_GATEWAY_BASE_URL`, `AI_GATEWAY_API_KEY`, `ALLOW_SHARED_GATEWAY_KEY`, `DEFAULT_CHAT_MODEL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_URL`.
5. OpenRouter default: `AI_GATEWAY_BASE_URL=https://openrouter.ai/api/v1`, shared OpenRouter key, one default chat model served by OpenRouter.
6. `PORT` handling: Railway injects `PORT`; the app listens on it and the Railway health check passes.
7. Health check path `/api/health`; full readiness also requires `/eve/v1/health`.
8. One-time schema setup: `bun run db:setup` plus committed migrations in `lib/db/migrations/`.
9. Document how sandbox code execution behaves on Railway (no Docker socket).
10. Prove one long conversation with early, middle, and recent facts on the Railway deployment.

## Non-goals

- No Umbrel, Portainer, Docker-socket middleware, or Squid egress work in this PRD.
- No sibling-container sandbox on Railway.
- No multi-provider router or administrator model catalog UI in this PRD. That work stays in `tasks/prd-configurable-model-providers-and-workloads.md`.
- No automatic scaling, multi-region, or cost optimization.
- No email delivery or Lookout schedule changes.

## Functional requirements

1. A fresh Railway project deploys the app from this repository.
2. The app serves the public Railway domain over HTTPS.
3. Sign-in, chat send, streaming, retry, reload, and restart work on that domain.
4. The model catalog loads from OpenRouter through `AI_GATEWAY_BASE_URL`.
5. Ordinary turns run without a per-user gateway key when `ALLOW_SHARED_GATEWAY_KEY=true`.
6. Uploads survive redeploys through the attached volume.
7. The database survives redeploys through the Postgres service storage.
8. Sandbox tool calls fail with a clear message instead of hanging the turn.

## Technical requirements

### Configuration

- Set `AI_GATEWAY_BASE_URL` to the OpenRouter v1 endpoint.
- Set `AI_GATEWAY_API_KEY` to the shared OpenRouter key. Never commit it.
- Set `ALLOW_SHARED_GATEWAY_KEY=true` for shared test use.
- Set `DEFAULT_CHAT_MODEL` to one OpenRouter model ID served by that endpoint. Rebuild after a change so `NEXT_PUBLIC_DEFAULT_CHAT_MODEL` matches.
- Set `BETTER_AUTH_URL` and `APP_URL` to the Railway public origin.
- Set `BETTER_AUTH_SECRET` from `openssl rand -base64 32`.
- Set `DATABASE_URL` from the Railway Postgres service reference.
- Send OpenRouter attribution headers when configured. Do not require them for generic gateways.

### Platform changes

- Keep one image. Read the runtime port from `PORT` when present. Keep `3000` as the local default.
- Probe readiness on the runtime port in `scripts/entrypoint.mjs` and the image `HEALTHCHECK`.
- Keep the entrypoint order: require `DATABASE_URL`, wait for the database, run the gated schema step only when enabled, then supervise Eve and Next.
- Keep `agent/agent.ts` compaction behavior unchanged in this PRD. Replace only the provider endpoint and model IDs.
- Replace the universal 200,000-token assumption with the selected OpenRouter model's verified context limit for compaction timing.

### Test plan

- `bun run typecheck` passes.
- `bun run lint` passes.
- `bun test` passes, including `lib/conversation-checkpoint.test.ts`, `lib/conversation-compaction.test.ts`, `lib/bootstrap-envelope.test.ts`, `hooks/use-eve-chat.test.ts`, and `evals/long-conversation-checkpoint.test.ts`.
- `python3 scripts/check-task-docs.py` passes.
- Production build from the root `Dockerfile` passes.
- Migration check passes on a fresh pgvector database.

### Eval and acceptance plan

- Evals apply because this changes provider, deployment, and long-conversation verification.
- Run the deterministic long-conversation fixture with unique early, middle, and recent facts.
- Force at least two compaction cycles on the Railway deployment.
- Check recall after continuous compaction, browser reload, app restart, branch, retry, edit, and replacement-session rebuild.
- Run one ordinary chat, one tool call, one image attachment turn, and one Lookout where enabled.

## Acceptance criteria

- [ ] Railway builds the root `Dockerfile` without local patches.
- [ ] `GET /api/health` returns 200 on the Railway domain.
- [ ] `GET /eve/v1/health` returns ready on the Railway domain.
- [ ] The model catalog loads from OpenRouter.
- [ ] Ordinary chat streams on the shared OpenRouter key with no per-user key.
- [ ] A long thread preserves early, middle, and recent facts across two compactions.
- [ ] Facts survive reload, restart, branch, retry, edit, and replacement-session rebuild.
- [ ] Uploads survive a redeploy.
- [ ] Database rows survive a redeploy.
- [ ] Sandbox calls fail clearly and do not hang the turn.
- [ ] No secret appears in code, logs, diffs, or docs.

## Deployment

Deploy as two Railway services in one project:

1. Provision Postgres from a pgvector image. Attach persistent storage. Enable `vector` and `pg_trgm`.
2. Deploy the app from the repository with the root `Dockerfile`.
3. Attach an app volume at `LOCAL_STORAGE_DIR`.
4. Set the required environment values. Generate a public domain.
5. Run `bun run db:setup` once, then apply committed migrations once.
6. Verify both health endpoints, one chat turn, catalog load, and the long-thread fixture.
7. Use a scratch Railway project before changing a shared test project.

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
- Which OpenRouter compaction model handles the checkpoint summaries?
- Should Railway use `RUN_DB_PUSH=true` or a one-time migration job?
- How should invite-only signup interact with the first Railway administrator?
