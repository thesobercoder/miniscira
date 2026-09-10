# PRD: Firecrawl default search

- **Status:** In progress
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-firecrawl-default-search)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Approved by Soham on 2026-09-10. Proceed instruction received the same day.

## Goal

Make Firecrawl the default web search provider. Each search tool turns itself on from its own key. A general search turn uses `firecrawl_search` first. A page read uses `firecrawl_scrape`. A site map uses `firecrawl_map`. Reddit search runs on Firecrawl and no longer needs SearXNG. A future GitHub tool follows the same pattern.

## User stories

- As a user, I get web answers from Firecrawl search on a general research turn.
- As a user, I get Reddit opinions from the same Firecrawl key. No second search service is required.
- As an operator, I set one Firecrawl key and search works. No Exa key is required.
- As an operator, I set an xAI key and X search works. Each tool follows its own key.

## Scope

1. Route the default general search path through `firecrawl_search`.
2. Keep `firecrawl_scrape` as the page reader and `firecrawl_map` for site mapping.
3. Move `reddit_search` from SearXNG to Firecrawl. It sends `site:reddit.com` queries through the Firecrawl `/v2/search` endpoint. Remove `SEARXNG_URL` from the tool, `.env.example`, and `docs/DEPLOYMENT.md`.
4. Share one Firecrawl request helper across `firecrawl_search`, `reddit_search`, and the future GitHub tool. Keep the existing `redditQuery` helper in `lib/reddit-search.ts` for query shaping.
5. Keep `exa_search` available only when `EXA_API_KEY` is set. It is not the default.
6. Keep `x_search` for X content. It turns on only when `XAI_API_KEY` is set.
7. Update tool descriptions so the model prefers Firecrawl for broad queries.
8. Treat search keys as optional at startup. A search turn without a provider key returns a clear message and the turn continues.

### Out of scope detail

- `agent/tools/web_search.ts` still names `exa_search` as the search provider. Update its comment to name Firecrawl as the default.
- `agent/tools/firecrawl_search.ts` does not claim the default role. Update its description to claim it.
- `agent/tools/exa_search.ts` already points broad queries at `firecrawl_search`. Keep that sentence and name Exa as the fallback.
- `agent/instructions/00-core.md` already names `firecrawl_search` as the default web search. Keep it.

## Non-goals

- No removal of Exa or xAI tools. They stay as narrow options keyed by their own variables.
- No new `github_search` tool in this PRD. This PRD only sets the shared pattern that tool will reuse.
- No change to the sandbox, models, auth, or deployment targets in this PRD.
- No new metrics endpoint or dashboard for search usage.

## Functional requirements

1. A general web search turn calls `firecrawl_search` when `FIRECRAWL_API_KEY` or `FIRECRAWL_API_URL` is set.
2. A Reddit turn calls `reddit_search`, which runs on the same Firecrawl key. Without a Firecrawl key it returns a message that names the missing variable. The turn continues.
3. A turn with no Firecrawl key but with an Exa key can still use `exa_search`.
4. An X turn uses `x_search` only when `XAI_API_KEY` is set. Without it the tool returns a not-configured message. The turn continues.
5. Page reads keep working through `firecrawl_scrape` with no behavior change.
6. Tool descriptions state the preference order. No two tools claim the same default role.
7. Every search tool keeps the stable `{ query, results, error? }` output shape for missing configuration, network failure, and provider errors.

## Technical requirements

- Add one shared Firecrawl request module used by `firecrawl_search` and `reddit_search`. It reads `FIRECRAWL_API_KEY` and `FIRECRAWL_API_URL`, sets the same headers and base-URL rules, and returns the same missing-config error. The future GitHub tool reuses it.
- Update the `web_search.ts` disable comment and the `firecrawl_search` description in `agent/tools/firecrawl_search.ts` to name Firecrawl as the default. Keep the `exa_search` fallback sentence in `agent/tools/exa_search.ts`.
- Rewrite `agent/tools/reddit_search.ts` to call the shared helper with `site:reddit.com` queries. Keep its input shape, its Reddit URL filter, and its per-query limits.
- Add one startup log line that names the configured search providers (`firecrawl`, `exa`, `xai`) without printing keys or URLs with credentials.
- Keep provider keys out of logs, responses, diffs, and docs. Log provider names only.

### Test plan

- `bun run typecheck` passes.
- `bun run lint` passes.
- `bun test` passes, including the existing Firecrawl self-hosted tests, a new test that `exa_search` still runs when only `EXA_API_KEY` is set, and new tests that `reddit_search` calls the Firecrawl endpoint and returns the missing-key error without Firecrawl config.
- `python3 scripts/check-task-docs.py` passes.
- One research turn on the Railway deployment uses Firecrawl and returns sources.

### Eval plan

- This changes tool routing through tool descriptions. Run four scripted checks against the deployed build and record which tool each turn calls.
- Fixture 1: ask a broad factual question. Expected outcome: the turn calls `firecrawl_search`.
- Fixture 2: ask for Reddit opinions on a topic. Expected outcome: the turn calls `reddit_search` and returns Reddit links.
- Fixture 3: ask for the most authoritative paper on a narrow topic with only `EXA_API_KEY` set. Expected outcome: the turn can call `exa_search`.
- Fixture 4: run a search turn with no provider key set. Expected outcome: the turn returns the missing-key message and continues.
- Pass threshold: all four checks behave as stated. Record the tool calls and the user-visible answers as evidence.

## Acceptance criteria

- [x] General search uses Firecrawl when `FIRECRAWL_API_KEY` or `FIRECRAWL_API_URL` is set.
- [x] Reddit search runs on the Firecrawl key and `SEARXNG_URL` is fully removed.
- [x] Exa remains usable as a fallback when only `EXA_API_KEY` is set.
- [x] X search works when `XAI_API_KEY` is set and reports clearly when it is not.
- [x] Missing search keys produce a message that names the missing variable and the turn continues.
- [x] `bun run typecheck`, `bun run lint`, and `bun test` pass, including the new Reddit and Exa tests.
- [x] `python3 scripts/check-task-docs.py` passes.
- [ ] One research turn on the Railway deployment uses Firecrawl and returns sources.
- [x] No provider key appears in logs, responses, diffs, or docs.
- [ ] The four eval fixtures behave as stated and the evidence is recorded.

## Deployment

1. Set `FIRECRAWL_API_KEY` on the Railway app service from the Firecrawl dashboard. Or point `FIRECRAWL_API_URL` at a self-hosted server.
2. Remove `SEARXNG_URL` from the deployment. Reddit search needs no separate service after this change.
3. Keep or remove the other provider keys per operator choice. Search keys stay optional. Chat works with none set.
4. Update `docs/RAILWAY_TEMPLATE.md`, `docs/DEPLOYMENT.md`, and `.env.example`. Do not paste key values into docs.
5. Verify one research turn returns Firecrawl sources on the deployed URL.

## Observability

- Log the configured search provider names once at startup without keys.
- A failed search returns an `error` field that names the provider and the HTTP status. The turn continues.
- Follow the existing `x_search` console error pattern for provider failures. No new endpoint.

## Rollback

1. Restore the previous provider keys, including `SEARXNG_URL`, from the pre-change snapshot.
2. Verify one search turn, one Reddit turn, and one page read.
3. No data migration is required.

## Open questions

- Should Exa stay configured on Railway as a fallback, or should Firecrawl be the only key? Recommendation: keep Exa set as a fallback until Firecrawl proves stable for two weeks.
- Should self-hosted Firecrawl stay an option, or is Firecrawl Cloud the standard? Recommendation: keep both. Cloud is the standard. Self-hosted stays for operators who need it.
