# Scalable research history implementation plan

This temporary plan maps the approved requirements in `tasks/prd-scalable-research-history.md` to implementation units and checks. Delete this file after the verified feature is complete.

## Verification tools

- Use Bun unit, component, API, database, migration, and eval tests for deterministic behavior.
- Use the existing Browser Use CLI through Hermes `browser_exec` for real authenticated browser acceptance. Do not add a second browser framework for this work.
- Browser Use checks must exercise the rendered application. Bun component and API tests do not replace browser acceptance for user-visible flows.

## Unit 1. Establish the durable history model and query contract

- Add fixed chat history classes, archive timestamps, pin state, and class-specific activity timestamps.
- Add durable Lookout run rows with immutable snapshots, status, lease ownership, report linkage, email timestamps, and failure summaries.
- Add additive indexes for active research, archived research, project research, Lookout reports, and automatic archive selection.
- Backfill existing research and Lookout report rows without changing event, document, upload, project, artifact, or Eve session relationships.
- Add one server module that owns cursor parsing, cursor encoding, stable ordering, class filters, and page-size limits.

Checks:

- Schema and migration tests cover defaults, constraints, indexes, and backfill classification.
- Cursor tests cover malformed values, ties on the timestamp, concurrent inserts, final pages, and user isolation.
- A migration fixture proves that existing relationships and Eve session fields remain unchanged.
- `bun run typecheck`, focused tests, and `git diff --check` pass.

## Unit 2. Route every writer through the lifecycle model

- Advance `lastActivityAt` only when the server creates a chat, accepts a user turn, persists a non-empty batch of genuine Eve events, or persists a terminal turn event. Use the database clock and never move the value backward.
- Preserve `lastActivityAt` for title changes, page and list reads, pin, archive, recovery, Eve cursor-only maintenance, project metadata changes, Lookout scheduling bookkeeping, branching metadata before a user turn is accepted, and permanent deletion.
- Update Lookout execution to create a run before work starts and to transition it through `claimed`, `running`, `succeeded`, `failed`, or `cancelled`. `Incomplete` is only the UI label for a safely persisted partial transcript linked to a `failed` run.
- Link each report chat to exactly one run and preserve report classification when a Lookout is deleted.
- Reject user-message append, continuation, branching, and project mutation for archived research and Lookout reports.

Checks:

- Route and helper tests cover every write path and read-only rejection.
- Named lifecycle timestamp tests prove that each advancing write changes `lastActivityAt` and each preserving write leaves it unchanged.
- Lookout tests cover success, partial output, failure, retry, lease expiry, duplicate claim prevention, deletion during a run, and exact report links.
- Named Lookout transition tests reject invalid state transitions and prove that an `Incomplete` transcript remains a `failed` run.
- Existing Eve event retry and ordering tests remain green.

## Unit 3. Add bounded active-history pagination

- Return 30-row active research pages from the chats API.
- Use the shared keyset cursor and include the current chat separately when it is outside the loaded page.
- Paginate project chat lists with the same ordering contract.
- Keep at most 10 pages or 300 rows in client state and at most 120 rendered rows.
- Preserve create, title, archive, recover, delete, and current-row reconciliation without duplicates.

Checks:

- API tests cover page boundaries, ownership, filters, current-row inclusion, and project pages.
- Reducer tests cover new rows, title changes, archive, recovery, deletion, cache eviction, and reload of evicted pages.
- Browser tests cover initial load, scrolling, concurrent creation, current deep links, long histories, and narrow screens.

## Unit 4. Separate complete-history search from loaded pages

- Search all owned active and archived research and all Lookout reports without depending on sidebar state.
- Add class and date filters with class-specific timestamps.
- Label archived research and Lookout reports in UI and agent results.
- Include Lookout reports in agent retrieval by default.

Checks:

- Search tests cover active, archived, report, project, date, ownership, ranking, and result limits.
- Agent tests cover report labels, grants, ownership, current-thread precedence, and hostile instructions in old report content.
- Update and run the thread-search eval cases for report inclusion, source labels, ownership, and prompt injection.
- Browser tests open owned results from each history class.

## Unit 5. Organize Lookout reports

- Remove Lookout reports from ordinary Research history.
- Show each Lookout with its latest succeeded report, latest-run outcome, and paginated report history.
- Show running and failed runs that have no report chat.
- Label a safely persisted partial transcript from a failed run as `Incomplete`. Do not add `incomplete` as a run status.
- Open the exact report from its email link.

Checks:

- API tests cover report pagination, deleted parent Lookouts, incomplete runs, and run status visibility.
- Browser tests cover grouped reports, exact report links, parent deletion, and the latest-run failure message.
- A production-safe Lookout run proves the real rendered report and email link.

## Unit 6. Add archive, recovery, and automatic archival

- Add manual archive and recovery actions.
- Add an archived view with cursor pagination.
- Keep archived research read-only until recovery.
- Add automatic archive settings with the approved defaults, eligibility rules, cadence, batch size, recovery delay, and pin behavior.
- Make the automatic archive job idempotent and safe across retries.

Checks:

- Route tests cover ownership, repeated archive and recovery calls, pin behavior, and read-only enforcement.
- Scheduler tests cover cadence, thresholds, batches, retries, pinned rows, active streams, and recovery delay.
- Browser tests cover archive, archived view, recovery, deep links, search, and settings.

## Unit 7. Prove scale, migration, and production behavior

- Seed at least 10,000 mixed history rows for a test user.
- Record sanitized query plans for active history, archived history, report history, project history, search, and automatic archive selection.
- Verify bounded response sizes, stable later-page latency, and no duplicate or missing rows.
- Back up production data and capture relationship counts before migration.
- Apply the committed migration through the explicit migration workflow.
- Deploy the application and Eve together before enabling archive mutations or the automatic job.
- Exercise the authenticated production flows and monitor pagination, search, Lookouts, archive, recovery, and scheduling.

Checks:

- The scale script and query-plan script are rerunnable and contain no private content.
- Migration verification compares pre-change and post-change counts and representative relationships.
- `bun test`, `bun run lint`, `bun run typecheck`, `bun run check`, and `bun run build` pass.
- Browser-first production acceptance passes for the real rendered UI.
- The working tree is clean and local `HEAD` matches `origin/main` after the production-backed changes are committed and pushed.

## Acceptance mapping

Each Section 14 acceptance ID maps to one implementation unit and one or more named checks. Check names are stable planning names. The implementer may choose repository file names that fit nearby conventions, but must keep the named behavior and record the final file or command beside this matrix.

| Acceptance ID | Implementation unit | Named check |
|---|---|---|
| `AC-SB-01` | Unit 3. Active chats API and initial sidebar page. | `API active-history first-page limit`; `Browser sidebar initial 30-row bound` |
| `AC-SB-02` | Unit 3. Sidebar next-page sentinel and loading state. | `Component sidebar next-page skeleton`; `Browser sidebar scroll loads next page` |
| `AC-SB-03` | Units 1 and 3. Stable keyset order and client page merge. | `DB active-history stable ties`; `Unit history-page merge no gaps or duplicates` |
| `AC-SB-04` | Units 1 and 3. Upper-bound cursor and first-page reconciliation. | `DB active-history concurrent movement`; `Unit first-page activity reconciliation`; `Browser concurrent activity has one row` |
| `AC-SB-05` | Unit 3. Non-destructive next-page error and retry state. | `Component next-page failure preserves rows`; `Browser failed page retry preserves rows` |
| `AC-SB-06` | Unit 3. Exhausted-page state. | `Unit null cursor stops requests`; `Browser nextCursor null ends pagination` |
| `AC-SB-07` | Units 1 and 3. Active-class SQL filter. | `DB active-history class exclusions`; `Browser active sidebar excludes archived and reports` |
| `AC-SB-08` | Unit 3. Page cache eviction and row windowing. | `Unit history cache 300-row cap`; `Component rendered history 120-row cap`; `Browser long-scroll bounds` |
| `AC-SB-09` | Unit 3. Evicted-page reload with scroll anchoring. | `Unit evicted page reload`; `Browser evicted range restores position` |
| `AC-SB-10` | Unit 3. Project active-history API and UI pagination. | `API project-history bounded class filter`; `Browser project history pagination` |
| `AC-SB-11` | Units 3 and 7. Large seeded history on responsive layouts. | `Browser authenticated large history desktop`; `Browser authenticated large history narrow` |
| `AC-CS-01` | Unit 4. Complete owned-history search. | `API search unloaded owned result`; `Browser search opens unloaded result` |
| `AC-CS-02` | Unit 3. Owner-scoped current-chat metadata and temporary section. | `Unit unloaded active current row`; `Browser old active result shows Current chat` |
| `AC-CS-03` | Unit 3. Current-row de-duplication during page merge. | `Unit current row removed on page arrival`; `Browser Current chat merges by ID` |
| `AC-CS-04` | Unit 4. Typed result class and quiet labels. | `Component search history-class labels`; `Browser archived and Lookout search labels` |
| `AC-CS-05` | Unit 4. Bounded database search independent of client pages. | `API search result caps and sidebar independence`; `Load search bounded query plan` |
| `AC-CS-06` | Units 3 and 4. App Router result navigation. | `Component search uses App Router navigation`; `Browser result opens without document reload` |
| `AC-LR-01` | Units 1, 2, and 5. Scheduled run row and one linked report snapshot. | `Integration scheduled run creates one report`; `DB one report chat per run` |
| `AC-LR-02` | Units 1, 3, and 6. Report-class exclusions. | `DB report excluded from active and archived`; `Browser report absent from research lists` |
| `AC-LR-03` | Unit 5. Latest succeeded report lookup. | `API latest succeeded report without N+1`; `Browser Lookout latest report link` |
| `AC-LR-04` | Units 1 and 5. Bounded run-history cursor. | `API report-history first middle final pages`; `Browser report history newest first` |
| `AC-LR-05` | Units 2 and 5. Persisted email report link. | `Integration email links exact report`; `Browser email link opens exact report` |
| `AC-LR-06` | Units 2 and 5. Durable terminal statuses and failed partial-transcript label. | `Unit Lookout terminal transition table`; `API failed partial transcript classification`; `Browser failed run Incomplete label` |
| `AC-LR-07` | Unit 5. Separate latest-run outcome and latest succeeded report. | `API latest outcome separate from latest success`; `Browser recent failure beside older success` |
| `AC-LR-08` | Units 1, 2, and 5. Nullable parent link and immutable provenance. | `Migration deleted-parent report classification`; `API parent deletion preserves reports`; `Browser deleted Lookout report provenance` |
| `AC-LR-09` | Units 2, 5, and 7. Real scheduled and manual execution paths. | `Browser real scheduled Lookout timeline and answer`; `Browser real manual Lookout timeline and answer` |
| `AC-AR-01` | Units 1 and 6. Archive state on the existing chat row. | `Migration archive relationship preservation`; `Integration manual archive preserves dependent data` |
| `AC-AR-02` | Units 3 and 6. Active-list removal and archived cursor view. | `API archive moves row between class lists`; `Browser archived view after manual archive` |
| `AC-AR-03` | Units 2 and 6. Server write rejection and read-only UI. | `API archived write-path rejection table`; `Browser archived direct link is read-only` |
| `AC-AR-04` | Units 2 and 6. Recovery preserves `lastActivityAt`. | `DB recovery preserves activity timestamp`; `Browser recovery returns original activity order` |
| `AC-AR-05` | Units 2 and 6. Pin and active-run predicates in the final archive update. | `API manual archive pin conflict`; `DB archive active-run race`; `Scheduler active-run and pin exclusions` |
| `AC-AR-06` | Unit 6. Default policy and Lookout exclusion. | `API auto-archive default off`; `Scheduler one-week report exclusion`; `Browser auto-archive settings defaults` |
| `AC-AR-07` | Unit 6. Separate archive and permanent-delete paths. | `Component archive and delete copy separation`; `API archive never calls delete`; `Scheduler archive never calls delete`; `Browser archive and permanent delete separation` |
| `AC-SP-01` | Units 1 through 6. Owner predicates on every route and direct read. | `Authorization cross-user history matrix`; `Browser foreign direct link safe not-found` |
| `AC-SP-02` | Units 1 and 7. Additive backfill and relationship preservation. | `Migration existing chat and report preservation` |
| `AC-SP-03` | Units 1 and 7. Representative before-and-after migration fixture. | `Migration event sequence comparison`; `Migration Eve session and continuation comparison`; `Migration documents uploads projects provenance and artifacts comparison` |
| `AC-SP-04` | Unit 7. Large seeded database and intended indexes. | `Load active archived report project search archive-selection query plans` |
| `AC-SP-05` | Units 1 through 7. Full verification and rollback exercise. | `Gate Bun unit and integration suite`; `Gate Browser Use acceptance suite`; `Gate additive migration verification`; `Rollback pre-archive compatible image`; `Rollback post-archive known archive-aware image` |
| `AC-SP-06` | Unit 7. Authenticated production acceptance. | `Production sidebar and search acceptance`; `Production archive and recovery acceptance`; `Production scheduled and manual Lookout acceptance` |
| `AC-SP-07` | Unit 7. Production source-control closeout. | `Production git clean`; `Production HEAD equals origin main` |

## Eval plan

Model evals apply only to the retrieval behavior changed in Unit 4. Extend the existing thread-search eval suite with these cases:

- A Lookout report is retrieved when it is the best prior source.
- The result identifies the source as a Lookout report.
- A report owned by another user is never returned.
- Instructions inside an old report remain quoted source data and never override the current request.
- Current-thread evidence wins when it conflicts with a prior report.

Pagination, grouping, archive state, recovery, and scheduling use deterministic tests and browser acceptance instead of model evals.
