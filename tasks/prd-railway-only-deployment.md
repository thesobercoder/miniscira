# PRD: Railway-only deployment

- **Status:** In progress
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-railway-only-deployment)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Not approved

## Goal

Make Railway the only deployment target. Remove Umbrel, Portainer, Docker-socket middleware, Squid egress, and other self-host paths that Railway replaces. Keep one documented path: the root `Dockerfile` on Railway with Postgres and volumes.

## User stories

- As an operator, I find one deployment guide and it covers Railway.
- As a maintainer, I change one entrypoint and one health check without checking three platforms.
- As a user, I see no behavior change. Chat, uploads, and research keep working.

## Scope

1. Remove Umbrel and Portainer runbooks, middleware references, and Portainer-only scripts that Railway does not use.
2. Keep Docker Compose files only where they still serve local development. Remove what serves only Umbrel production.
3. Keep the sandbox path that Railway supports. Remove the sibling-container assumptions that cannot run on Railway.
4. Update `docs/DEPLOYMENT.md` so Railway is the primary path.
5. Keep `LOCAL_STORAGE_DIR` volume semantics for Railway. Remove Umbrel volume names.
6. Remove hardcoded model tables from `lib/models.ts`. The live gateway catalog is the only source for vendors, names, modalities, and context windows.
7. Apply the slash rule everywhere: a `provider/model` id takes the vendor from the part before the slash and the display tail from the part after it. Bare ids without a slash resolve through catalog `owned_by` and fall back to the id itself.
8. Group the model picker automatically by the derived vendor. No maintained vendor list and no pinned provider order.

## Non-goals

- No change to chat, models, auth, search, or Lookouts in this PRD.
- No change to the Eve `auth:` chain order in `agent/channels/eve.ts`.
- No automatic migration of existing Umbrel data. A manual export and import note is enough.

## Functional requirements

1. The repository holds no Umbrel-only production step in the default path.
2. Every deployment document names Railway first. Umbrel notes are gone or marked removed.
3. The app builds, migrates, and serves from the root `Dockerfile` on Railway with no removed component in the chain.
4. Local development keeps working through the documented Compose path where it remains.
5. No model id, vendor name, capability, or context window is maintained by hand in code. Every value resolves from the live catalog or the id itself.
6. The picker shows every catalog chat model grouped under its derived vendor with no missing or gateway-labeled vendors.
7. The default chat model resolves from `DEFAULT_CHAT_MODEL` and validates against the live catalog. A hardcoded id is only the last-resort fallback when the catalog is unreachable.

## Technical requirements

- Delete or archive `docs/UMBREL_SANDBOX_OPERATIONS.md` and its references in `docs/DEPLOYMENT.md` and `AGENTS.md`.
- Remove Portainer-only environment variables and middleware wiring that the Railway entrypoint never reads.
- Keep `scripts/entrypoint.mjs`, `scripts/migrate.mjs`, and the Railway health checks untouched in behavior.
- Prove no remaining code import references a deleted module.
- Delete `MODEL_VENDOR`, `VENDOR_SLUGS`, `CHAT_MODELS` as an availability list, `PROVIDER_ORDER`, and the `cpa` gateway fallback from `lib/models.ts`.
- Rewrite `providerOf` as the slash rule with catalog `owned_by` precedence and the raw id as the last resort. No table lookup remains.
- Filter non-chat models by catalog modalities and endpoint capability, not by id lists. Delete `NON_CHAT_MODELS` and suffix regexes in `lib/gateway-models.ts`.
- Build picker groups at render time from derived vendors sorted alphabetically. Keep brand icons only as an optional display map with a generic glyph fallback.
- Resolve the default from environment first and warn when the live catalog does not serve it. Keep one last-resort builtin id for catalog-outage boot only.

### Test plan

- `bun run typecheck` passes.
- `bun run lint` passes.
- `bun test` passes.
- `python3 scripts/check-task-docs.py` passes.
- Production build from the root `Dockerfile` passes.
- `grep` for Umbrel, Portainer, Squid, and middleware names returns only historical notes.

### Eval plan

- Evals do not apply. This removes deployment targets only. It does not change agent behavior, prompts, tools, retrieval, memory, or model routing.

## Acceptance criteria

- [ ] No Umbrel production path remains in code or docs.
- [ ] Railway is the single documented deployment target.
- [ ] No hardcoded model, vendor, capability, or context table remains in code.
- [ ] The picker groups derived vendors automatically with no maintained list.
- [ ] Typecheck, lint, unit, build, and docs checks pass.
- [ ] The Railway deployment still passes health, chat, and migration checks.
- [ ] A grep for removed component names finds only historical notes.

## Deployment

1. Merge the removal behind the normal PR checks.
2. Redeploy Railway from `main` after merge.
3. Verify both health endpoints, one chat turn, and migration idempotency.

## Observability

- Deploy logs show the same database wait, migration result, Eve start, and Next start lines as before.
- No new log source is added.

## Rollback

1. Redeploy the previous image from before the removal.
2. Restore the removed docs from version control when needed.
3. Verify health and one chat turn.

## Open questions

- Should Compose stay for local development, or should local runs use the same Railway image directly?
- Should the Umbrel runbook move to an archive folder or leave the repository fully?
- Should brand icons stay as an optional display map, or should the picker use generic glyphs only?
