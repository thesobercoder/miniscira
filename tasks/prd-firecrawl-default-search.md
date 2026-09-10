# PRD: Firecrawl default search

- **Status:** To do
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-firecrawl-default-search)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Not approved

## Goal

Make Firecrawl the default web search provider. A general search turn uses `firecrawl_search` first. A page read uses `firecrawl_scrape`. A site map uses `firecrawl_map`. Other providers serve narrow uses only.

## User stories

- As a user, I get web answers from Firecrawl search on a general research turn.
- As an operator, I set one Firecrawl key and search works. No Exa key is required.
- As an operator, I can still set Exa, xAI, or SearXNG keys for their narrow tools.

## Scope

1. Route the default general search path through `firecrawl_search`.
2. Keep `firecrawl_scrape` as the page reader and `firecrawl_map` for site mapping.
3. Keep `exa_search` available only when `EXA_API_KEY` is set. It is not the default.
4. Keep `x_search` for X content and `reddit_search` for Reddit content.
5. Update tool descriptions so the model prefers Firecrawl for broad queries.
6. Treat Firecrawl keys as optional at startup. A search turn without a provider key returns a clear message and the turn continues.

### Out of scope detail

- `agent/tools/web_search.ts` still names `exa_search` as the search provider. Update its comment to name Firecrawl as the default.
- `agent/tools/firecrawl_search.ts` does not claim the default role. Update its description to claim it.
- `agent/tools/exa_search.ts` already points broad queries at `firecrawl_search`. Keep that sentence and name Exa as the fallback.
- `agent/instructions/00-core.md` already names `firecrawl_search` as the default web search. Keep it.

## Non-goals

- No change to the sandbox, models, auth, or deployment targets in this PRD.
- No removal of Exa, xAI, or SearXNG tools. They stay as narrow options.
- No new metrics endpoint or dashboard for search usage.

## Functional requirements

1. A general web search turn calls `firecrawl_search` when `FIRECRAWL_API_KEY` or `FIRECRAWL_API_URL` is set.
2. A turn with no Firecrawl key and no other provider key returns a plain message that names the missing key. The turn continues.
3. A turn with no Firecrawl key but with an Exa key can still use `exa_search`.
4. Page reads keep working through `firecrawl_scrape` with no behavior change.
5. Tool descriptions state the preference order. No two tools claim the same default role.

## Technical requirements

- Update the `web_search.ts` disable comment and the `firecrawl_search` description in `agent/tools/firecrawl_search.ts` to name Firecrawl as the default. Keep the `exa_search` fallback sentence in `agent/tools/exa_search.ts`.
- Add one startup log line that names the configured search providers (`firecrawl`, `exa`, `xai`, `searxng`) without printing keys or URLs with credentials.
- Keep provider keys out of logs, responses, diffs, and docs. Log provider names only.
- A tool call with missing config returns an `error` field with the exact variable name. The turn continues. This matches the current Firecrawl and Exa tool behavior.

### Test plan

- `bun run typecheck` passes.
- `bun run lint` passes.
- `bun test agent/tool-tests/firecrawl.test.ts` passes, plus a new test that `exa_search` still runs when only `EXA_API_KEY` is set.
- `python3 scripts/check-task-docs.py` passes.
- One research turn on the Railway deployment uses Firecrawl and returns sources.

### Eval plan

- This changes tool routing through tool descriptions. Run three scripted checks against the deployed build and record which tool each turn calls.
- Fixture 1: ask a broad factual question. Expected outcome: the turn calls `firecrawl_search`.
- Fixture 2: ask for the most authoritative paper on a narrow topic with only `EXA_API_KEY` set. Expected outcome: the turn can call `exa_search`.
- Fixture 3: run a search turn with no provider key set. Expected outcome: the turn returns the missing-key message and continues.
- Pass threshold: all three checks behave as stated. Record the tool calls and the user-visible answers as evidence.

## Acceptance criteria

- [ ] General search uses Firecrawl when `FIRECRAWL_API_KEY` or `FIRECRAWL_API_URL` is set.
- [ ] Exa remains usable as a fallback when only `EXA_API_KEY` is set.
- [ ] Missing search keys produce a message that names the missing variable and the turn continues.
- [ ] `bun run typecheck`, `bun run lint`, and `bun test` pass, including the new Exa fallback test.
- [ ] `python3 scripts/check-task-docs.py` passes.
- [ ] One research turn on the Railway deployment uses Firecrawl and returns sources.
- [ ] No provider key appears in logs, responses, diffs, or docs.
- [ ] The three eval fixtures behave as stated and the evidence is recorded.

## Deployment

1. Set `FIRECRAWL_API_KEY` on the Railway app service from the Firecrawl dashboard. Or point `FIRECRAWL_API_URL` at a self-hosted server.
2. Keep or remove the other provider keys per operator choice. Search keys stay optional. Chat works with none set.
3. Document the key choice in `docs/RAILWAY_TEMPLATE.md` and `.env.example` only. Do not paste key values into docs.
4. Verify one research turn returns Firecrawl sources on the deployed URL.

## Observability

- Log the configured search provider names once at startup without keys.
- A failed search returns an `error` field that names the provider and the HTTP status. The turn continues.
- Follow the existing `x_search` console error pattern for provider failures. No new endpoint.

## Rollback

1. Restore the previous provider keys from the pre-change snapshot.
2. Verify one search turn and one page read.
3. No data migration is required.

## Open questions

- Should Exa stay configured on Railway as a fallback, or should Firecrawl be the only key? Recommendation: keep Exa set as a fallback until Firecrawl proves stable for two weeks.
- Should self-hosted Firecrawl stay an option, or is Firecrawl Cloud the standard? Recommendation: keep both. Cloud is the standard. Self-hosted stays for operators who need it.
