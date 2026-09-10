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
8. Treat search keys as optional at startup. Expose only tools whose providers are configured at runtime, for both the root agent and the researcher. A turn without search tools explains that live search is unavailable and continues.

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
2. A Reddit turn calls `reddit_search`, which runs on the same Firecrawl key or self-hosted URL. Without either variable, the tool is absent. The turn explains the limitation and continues.
3. A turn with no Firecrawl key but with an Exa key can still use `exa_search`.
4. An X turn uses `x_search` only when `XAI_API_KEY` is set. Without it the tool is absent. The turn explains the limitation and continues.
5. Page reads keep working through `firecrawl_scrape` with no behavior change.
6. Tool descriptions state the preference order. No two tools claim the same default role.
7. Preserve each tool's output contract. General Firecrawl and Exa search use `{ query, results, error? }`. Reddit and X use `{ queries, results, error? }`. Page tools use `url` and their existing content fields. Direct calls still return a safe missing-configuration error.
8. Firecrawl and Reddit report network, HTTP, provider, invalid JSON, and malformed-result failures through `error`. Preserve valid results from partial responses and successful Reddit queries. Never interpret a failed query as an empty successful search.

## Technical requirements

- Add one shared Firecrawl request module used by `firecrawl_search` and `reddit_search`. It reads `FIRECRAWL_API_KEY` and `FIRECRAWL_API_URL`, sets the same headers and base-URL rules, and returns the same missing-config error. The future GitHub tool reuses it.
- Update the `web_search.ts` disable comment and the `firecrawl_search` description in `agent/tools/firecrawl_search.ts` to name Firecrawl as the default. Keep the `exa_search` fallback sentence in `agent/tools/exa_search.ts`.
- Rewrite `agent/tools/reddit_search.ts` to call the shared helper with `site:reddit.com` queries. Keep its input shape, its Reddit URL filter, and its per-query limits.
- Add one startup log line that names the configured search providers (`firecrawl`, `exa`, `xai`) without printing keys or URLs with credentials.
- Keep provider keys out of logs, responses, diffs, and docs. Log provider names only.
- Use Eve's installed `defineDynamic` API in each tool file. Resolve at `step.started` and return the tool or `null`. Keep filename-derived names stable. Researcher re-exports use the same resolvers.
- Read configuration at runtime, not during compilation. A Firecrawl key or URL enables search, scrape, map, and Reddit. Exa and X use their own keys. Whitespace-only values count as missing.
- Root instructions, researcher instructions, `deep_research`, and `compare_options` start general research with Firecrawl. Exa is for explicit semantic searches or a fallback when Firecrawl is unavailable or fails.

### Test plan

- `bun run typecheck` passes.
- `bun run lint` passes.
- `bun test` passes, including the existing Firecrawl self-hosted tests, a new test that `exa_search` still runs when only `EXA_API_KEY` is set, and new tests that `reddit_search` calls the Firecrawl endpoint and returns the missing-key error without Firecrawl config.
- `python3 scripts/check-task-docs.py` passes.
- `bun run check` and `git diff --check` pass. Review formatter changes and remove unrelated churn.
- The root and researcher provider matrix covers no providers, Firecrawl Cloud, URL-only Firecrawl, Exa-only, X, all providers, and removal after import.
- Failure fixtures cover safe error text, malformed data, partial results, duplicate Reddit URLs, and non-Reddit URL filtering.
- One research turn on the Railway deployment uses Firecrawl and returns sources.

### Eval plan

- This changes tool routing through descriptions, availability, and instructions. Run live-model fixtures with isolated provider outputs using `bun scripts/eval-search-routing.ts`. Set `AI_GATEWAY_BASE_URL`, `AI_GATEWAY_API_KEY`, and `EVAL_CHAT_MODEL` or `DEFAULT_CHAT_MODEL`. Never change production provider variables for fixtures.
- Fixture 1: ask a broad factual question. Expected outcome: the turn calls `firecrawl_search`.
- Fixture 2: ask for Reddit opinions on a topic. Expected outcome: the turn calls `reddit_search` and returns Reddit links.
- Fixture 3: ask for the most authoritative paper on a narrow topic with only `EXA_API_KEY` set. Expected outcome: the turn can call `exa_search`.
- Fixture 4: run a search turn with no provider key set. Expected outcome: no provider tools are available and the model explains that live search is unavailable.
- Fixtures 5 through 7 use researcher instructions, the loaded deep-research skill, and the loaded comparison skill. Expected outcome: general research starts with `firecrawl_search`, even when Exa is configured.
- Pass threshold: all seven fixtures pass. Each configured case starts with its expected tool and returns a source link. Record tool calls and answers. These isolated model fixtures do not prove skill loading, delegated execution, or deployed chat.
- Run `eve eval --url <deployed-origin> --tag firecrawl-default --strict` against the approved deployment. `evals/firecrawl-default-search.eval.ts` checks general and Reddit chat routing and source links. Also verify one real delegated research turn.

## Acceptance criteria

- [ ] General search uses Firecrawl when `FIRECRAWL_API_KEY` or `FIRECRAWL_API_URL` is set, including real model routing.
- [x] Reddit search runs on the Firecrawl key and `SEARXNG_URL` is fully removed.
- [x] Exa remains usable as a fallback when only `EXA_API_KEY` is set.
- [x] X search remains available with `XAI_API_KEY` and absent without it in both agents.
- [ ] Only configured providers appear at runtime in both agents. No-provider model fixtures explain the limitation and continue.
- [x] Provider failures return safe errors and preserve partial search results.
- [x] `bun run typecheck`, `bun run lint`, `bun test`, `bun run check`, and `git diff --check` pass, including the provider matrix and failure tests.
- [x] `python3 scripts/check-task-docs.py` passes.
- [ ] One research turn on the Railway deployment uses Firecrawl and returns sources.
- [x] No provider key appears in new logs, error responses, diffs, or docs.
- [ ] The seven isolated live-model fixtures pass and the evidence is recorded.
- [ ] Deployed general, Reddit, and delegated research turns pass with recorded tool calls and sources.

## Deployment

1. Set `FIRECRAWL_API_KEY` on the Railway app service from the Firecrawl dashboard. Or point `FIRECRAWL_API_URL` at a self-hosted server.
2. Remove `SEARXNG_URL` from the deployment. Reddit search needs no separate service after this change.
3. Keep or remove the other provider keys per operator choice. Search keys stay optional. Chat works with none set.
4. Update `docs/RAILWAY_TEMPLATE.md`, `docs/DEPLOYMENT.md`, and `.env.example`. Do not paste key values into docs.
5. Verify one research turn returns Firecrawl sources on the deployed URL.

## Observability

- Log the configured search provider names once at startup without keys.
- A failed search returns an `error` field that names the provider and the HTTP status when present. Partial Reddit failures identify the query index. The turn continues.
- Do not include raw exception messages or provider response bodies in errors. They can contain credentials. No new endpoint.

## Rollback

1. Restore the previous provider keys, including `SEARXNG_URL`, from the pre-change snapshot.
2. Verify one search turn, one Reddit turn, and one page read.
3. No data migration is required.

## Open questions

- Should Exa stay configured on Railway as a fallback, or should Firecrawl be the only key? Recommendation: keep Exa set as a fallback until Firecrawl proves stable for two weeks.
- Should self-hosted Firecrawl stay an option, or is Firecrawl Cloud the standard? Recommendation: keep both. Cloud is the standard. Self-hosted stays for operators who need it.
