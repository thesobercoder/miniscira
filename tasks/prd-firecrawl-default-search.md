# PRD: Firecrawl default search

- **Status:** To do
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-firecrawl-default-search)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Not approved

## Goal

Make Firecrawl the default web search provider for the whole project. Every general search turn uses `firecrawl_search` first. Page reads use `firecrawl_scrape`. Site mapping uses `firecrawl_map`. Other providers stay as fallback only where Firecrawl cannot serve.

## User stories

- As a user, I get web answers from Firecrawl-backed search on every research turn.
- As an operator, I set one Firecrawl key and search works. No Exa key is required.
- As an operator, I can still set Exa, xAI, or SearXNG keys for their narrow tools.

## Scope

1. Route the default general search path through `firecrawl_search`.
2. Keep `firecrawl_scrape` as the page reader and `firecrawl_map` for site mapping.
3. Keep `exa_search` available only when `EXA_API_KEY` is set. It is not the default.
4. Keep `x_search` for X content and `reddit_search` for Reddit content.
5. Update tool descriptions so the model prefers Firecrawl for broad queries.
6. Require `FIRECRAWL_API_KEY` or `FIRECRAWL_API_URL` on Railway. Fail with a clear message when neither is set.

## Non-goals

- No change to the sandbox, models, auth, or deployment targets in this PRD.
- No removal of Exa, xAI, or SearXNG tools. They stay as narrow options.
- No change to the Eve `auth:` chain order in `agent/channels/eve.ts`.

## Functional requirements

1. A general web search turn calls `firecrawl_search` when Firecrawl is configured.
2. A turn with no Firecrawl key and no other provider key reports that search is unavailable. The turn continues.
3. A turn with no Firecrawl key but with an Exa key can still use `exa_search`.
4. Page reads keep working through `firecrawl_scrape` with no behavior change.
5. Tool descriptions state the preference order. No two tools claim the same default role.

## Technical requirements

- Update `agent/tools/web_search.ts` comments and the `exa_search` description in `agent/tools/exa_search.ts` to name Firecrawl as the default.
- Add a startup log that names the active search providers without printing keys.
- Keep provider keys out of logs, responses, diffs, and docs.

### Test plan

- `bun run typecheck` passes.
- `bun run lint` passes.
- `bun test` passes, including new search-routing unit tests.
- `python3 scripts/check-task-docs.py` passes.
- One research turn on the Railway deployment uses Firecrawl and returns sources.

### Eval plan

- Evals do not apply. This changes tool routing only. It does not change agent behavior, prompts, retrieval, memory, or model routing.

## Acceptance criteria

- [ ] General search uses Firecrawl when configured.
- [ ] Exa remains usable as a fallback when its key is set.
- [ ] Missing search keys produce a clear message and the turn continues.
- [ ] Unit, integration, and production checks pass.
- [ ] No provider key appears in logs, responses, diffs, or docs.

## Deployment

1. Set `FIRECRAWL_API_KEY` on the Railway app service from the Firecrawl dashboard.
2. Keep or remove the other provider keys per operator choice.
3. Verify one research turn returns Firecrawl sources on the deployed URL.

## Observability

- Log the active search provider per turn without keys or query bodies.
- Expose search failure counts by provider for operators.

## Rollback

1. Restore the previous provider keys from the pre-change snapshot.
2. Verify one search turn and one page read.
3. No data migration is required.

## Open questions

- Should Exa stay configured on Railway as a fallback, or should Firecrawl be the only key?
- Should self-hosted Firecrawl stay an option, or is Firecrawl Cloud the standard?
