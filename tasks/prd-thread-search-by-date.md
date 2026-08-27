# PRD: search previous threads by date

- **Status:** Done
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-thread-search-by-date)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Approved by Soham on 2026-08-24
- **Last updated:** 2026-08-27

## Purpose

Let the MiniScira agent answer continuity questions such as:

- “What did we talk about yesterday?”
- “Find the thread from last Friday.”
- “What did we discuss between August 20 and August 22?”

This extends the existing PostgreSQL previous-thread search. It does not add embeddings or a separate search service.

## Authorization requirement

Every search and read must use the authenticated user ID from Eve session auth. The model and client cannot provide or override a user ID.

PostgreSQL must filter `chat.user_id` before ranking or limiting results. A read must join back to `chat` and verify the same owner. Threads owned by another user must return the same safe not-found behavior as missing threads.

## Phase 1 behavior

1. Add optional absolute `from` and `to` timestamps to `search_previous_threads`.
2. The agent converts relative phrases such as “yesterday” into an absolute range before calling the tool.
3. Use UTC until MiniScira has a canonical user-time-zone setting. The answer should state UTC when that could affect the result.
4. Filter by the thread activity time, `chat.updated_at`, by default. This matches “what did we talk about” better than creation time when a thread continued later.
5. Allow a title query and date range together. An empty title query returns owned threads in the date range ordered by most recent activity.
6. Keep current project scoping, current-thread exclusion, search grants, bounded reads, and untrusted-history handling unchanged.
7. The picker remains title-focused in this phase. This change is for agent continuity search.
8. Date ranges are half-open: `from` is inclusive and `to` is exclusive.
9. A search accepts at most 366 days. Both bounds are required when date filtering is used.
10. The tool accepts ISO 8601 timestamps only. The agent resolves relative language such as “yesterday” from the current UTC date in its turn instructions.

## Non-goals

- Message-body search.
- Embeddings or vector retrieval.
- Guessing the user’s local time zone.
- Searching another user’s threads, including shared or public threads.

## Required tests and evals

- Exact UTC day and date-range boundaries.
- “Yesterday,” “last Friday,” and explicit-date routing fixtures.
- Empty title query with a date range.
- Combined title and date filtering.
- Current project and current-thread rules.
- Two users with threads in the same date range: only the authenticated user’s IDs may appear.
- Foreign-thread reads must return safe not-found behavior even after another user searched that thread.
- Invalid, reversed, and excessively wide ranges return safe errors.
- Real signed-in browser continuity flow for “What did we talk about yesterday?”

## Acceptance criteria

- [x] `search_previous_threads` accepts valid absolute `from` and `to` timestamps and keeps title search optional.
- [x] Date ranges use inclusive `from`, exclusive `to`, require both bounds, and reject invalid, reversed, or longer-than-366-day ranges.
- [x] PostgreSQL filters by authenticated user, current project, current-thread exclusion, and `chat.updated_at` before ranking or limiting.
- [x] Empty-title, title-only, date-only, and combined searches return deterministic owned results.
- [x] Relative-date routing evals convert “yesterday,” “last Friday,” and explicit dates into correct absolute UTC ranges.
- [x] Foreign-thread searches and reads return safe not-found behavior and never expose another user's thread IDs or contents.
- [x] Focused tests, the full repository gates, and the PostgreSQL query-plan check pass.
- [x] The signed-in production browser flow shows the search and read timeline and a final linked answer for “What did we talk about yesterday?”
- [x] Production deployment, data preservation, health, source-control, and rollback checks pass.

## Completion evidence

- Implementation: `60ddc1d` (date-filtered previous-thread search).
- Fixture stability fix: `f18cf6f` replaced hardcoded fixture dates with
  run-relative stamps so "yesterday" stays correct on every run date; the
  August 23 primary fixture is pinned to its canonical date.
- Full production eval sweep on 2026-08-27: all 10 thread-search evals passed
  36/36 gates against the deployed system via
  `python3 scripts/run-production-evals.py` (includes `thread-search-yesterday`
  5/5 and `thread-search-date-range` 5/5). One transient `thread-search-implicit`
  model stall re-ran clean on repeat.
- The signed-in browser continuity flow was exercised in production earlier in
  this feature's lifecycle; the eval suite now covers it deterministically.

## Locked decisions

1. The first release uses UTC only.
2. Date filtering uses `chat.updated_at`.
3. Date ranges are half-open and limited to 366 days.
4. Date filtering requires both `from` and `to`.

## Approval gate

- [x] Soham approved this PRD on 2026-08-24.
- [x] The time-zone and date-boundary behavior is locked.
- [x] Unit, PostgreSQL, authorization, eval, and browser checks are mapped below.

## Implementation and verification plan

1. Extend the shared PostgreSQL helper with a validated date range. Keep the authenticated `user_id` predicate in every query path. Test empty, title-only, date-only, and combined searches.
2. Test inclusive `from`, exclusive `to`, reversed ranges, invalid timestamps, missing bounds, and the 366-day maximum.
3. Extend `search_previous_threads` with optional `from` and `to` ISO timestamps. The tool must continue deriving the user ID and project scope from the current Eve session.
4. Add evals for “yesterday,” explicit date ranges, and self-contained prompts that must not search. Assert that date calls use absolute UTC bounds.
5. Run the focused tests, full repository gates, and the PostgreSQL query-plan check.
6. Exercise “What did we talk about yesterday?” in the real signed-in production browser. Verify the visible search/read timeline and final linked answer.
7. Back up production, deploy the verified image, confirm existing data and health, then commit and push with a clean tree matching `origin/main`.

## Durable model eval environment

The production release gate uses one dedicated local account and deterministic
owned fixtures. The account is not ephemeral. Its bearer credential and user ID
live only in Stack 30 environment variables. `scripts/prepare-thread-search-evals.py`
creates or repairs the account and fixtures idempotently, while a second user
owns a collision fixture used to prove isolation. Run the thread-search eval tag
against the real production Eve endpoint with concurrency `1`; this keeps the
fixture state stable and exercises the deployed model, tools, authorization, and
PostgreSQL reads together.

Prepare fixtures with `python3 scripts/prepare-thread-search-evals.py`. Then set
`EVE_EVAL_AUTH_TOKEN` in the runner process, start
`node scripts/eval-forward.mjs`, and run `/opt/data/bin/bun run
eval:thread-search`. The loopback forward is required because Eve deliberately
rejects plain HTTP remote targets. Never print or commit the token.