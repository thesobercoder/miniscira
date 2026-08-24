# PRD: scalable research history

- **Status:** Approved by Soham on 2026-08-24. Implementation in progress.
- **Promoted from:** `docs/PRODUCT_IDEAS.md` entry `Scalable research history`
- **Supersedes:** `tasks/prd-thread-archiving.md`
- **Repository:** `/opt/data/miniscira-src`
- **Primary surfaces:** sidebar, thread search, chat lifecycle, archived threads, Lookout reports, projects, database queries, and Eve schedules

## 1. Problem

MiniScira currently loads every owned chat into the sidebar. The query has no limit. As the user creates more research threads, the initial page query, server render, client state, and sidebar list all grow without a bound.

Lookouts make the problem worse. Every Lookout run creates a separate `chat` row with the same Lookout title. These rows appear beside user-created research. A recurring Lookout can fill the sidebar with repeated automated reports.

Search already runs in PostgreSQL and returns a bounded result set. Search can find an old thread without loading it into the sidebar. However, the sidebar does not yet support paged history, an old current thread that is outside the loaded page, archived-thread separation, or a distinct home for Lookout reports.

This PRD defines one history model for long-term use:

- the sidebar loads ordinary active research in bounded pages;
- search covers the complete owned history;
- archived research stays recoverable outside the active sidebar;
- Lookout reports stay as separate snapshots but appear under their parent Lookout;
- permanent deletion remains separate from organization and archival.

## 2. Goals

- Keep each sidebar request, the initial render, and the rendered row count bounded for users with large histories.
- Let the user browse older active research by scrolling.
- Let global search find eligible threads whether or not the sidebar loaded them.
- Keep the currently open active thread visible when it falls outside loaded sidebar pages.
- Remove Lookout reports from ordinary research history.
- Give each Lookout a latest report and a paged report history.
- Let the user archive and recover ordinary research without deleting it.
- Keep automatic archival optional and off by default.
- Preserve events, documents, artifacts, project links, Lookout links, and Eve session state.
- Preserve strict ownership checks on every list, search, read, and mutation.

## 3. Product model

A `chat` is one stored research transcript. A history class tells the UI where that transcript belongs:

1. **Active research:** a user-created chat that is not archived and is not linked as a report by a Lookout run record.
2. **Archived research:** a user-created chat with archive state that is not linked as a report by a Lookout run record.
3. **Lookout report:** a chat linked to a durable Lookout run record. Each successful run remains a separate dated snapshot.

Lookout reports do not become ordinary active research when the parent Lookout is deleted. A durable Lookout run record preserves the owner, project, Lookout name at run time, trigger source, schedule identity, timestamps, outcome, and optional report chat link. Deleting the schedule clears only the optional parent link. It does not remove the run record or report class.

Permanent deletion is not a history class. Deletion removes the chat and its dependent data through the existing destructive path.

## 4. Fixed product decisions

### 4.1 Sidebar history

- The sidebar shows only active research.
- The initial request returns at most 30 rows.
- Near the bottom of the scroll area, the sidebar requests the next 30 rows.
- A short skeleton appears while the next page loads.
- The sidebar stops requesting pages when the server reports no next cursor.
- Pagination uses a stable cursor. It does not use SQL offsets.
- The ordering key is `lastActivityAt`, followed by chat ID as a stable tie-breaker.
- **Search chats** stays available above the scrolling history.
- New and newly active chats in the current client can move to the top without remounting or stopping an unrelated live Eve stream.
- A first-page reload reconciles activity from another tab or device. Later page cursors do not promise a frozen snapshot while rows are changing.
- The browser retains at most 10 pages, or 300 chat rows, for each history list. It evicts the page farthest from the visible range.
- The browser renders at most 120 chat rows around the visible range. Scrolling into an evicted range fetches that page again.

### 4.2 Complete-history search

- Search runs against the complete owned history in PostgreSQL.
- Search does not depend on sidebar pages already loaded in the browser.
- Search remains bounded to the approved user and agent result limits.
- Search results identify archived research and Lookout reports with quiet labels.
- Search can open an owned result directly.
- Agent thread retrieval continues to include active and archived research under the approved thread-search rules.
- Agent retrieval includes Lookout reports by default with a `Lookout report` label.

### 4.3 Current thread outside loaded pages

- An owned active research thread opened through search or a direct link remains visible in the sidebar even if its normal page has not loaded.
- Show it in a small **Current chat** section above the dated history groups.
- Do not fetch every earlier page to find its natural position.
- Remove the temporary section when normal pagination loads the same row.
- Archived research and Lookout reports do not appear in this temporary active-research section.

### 4.4 Lookout reports

- Each Lookout run has a separate durable run record. A run with persisted research has one separate chat as its immutable report snapshot.
- Lookout reports do not appear in the active research sidebar, project chat lists, or archived-research list.
- Each Lookout row exposes its latest successful report when one exists.
- Each Lookout exposes a paged run history ordered newest first.
- The sidebar shows at most 10 report chats inside each Lookout group. The newest report is labelled **Current**. Up to nine older reports use their run date and time as the row label. Report rows do not repeat the Lookout name.
- The 10-row sidebar limit does not delete or hide reports from search or the full paged Lookout history.
- A report row shows its run date, trigger source, and outcome state. Trigger source is `scheduled`, `manual`, or `retry`.
- Email links continue to open the exact report that generated the email.
- Manual **Run now** opens the exact completed report as it does today.
- Failed runs must be represented clearly. The product must not present an empty or partial report as a successful briefing.
- Deleting a Lookout deletes its schedule, not its past reports.
- Past reports remain readable and searchable with clear Lookout provenance.
- Report deletion is not part of this release. A report snapshot is immutable after its run reaches a terminal state.

### 4.5 Archive and recovery

- Archive is reversible state on the existing chat row.
- Only ordinary research can be manually archived in the first release.
- Archived research leaves the active sidebar and project chat lists.
- A dedicated archived view lists archived research with cursor pagination.
- An archived chat stays readable through its direct link.
- An archived chat is read-only until the user recovers it.
- Recovery preserves the transcript and Eve session data.
- Archive and delete remain separate actions with different copy and server paths.
- Automatic archival is optional, per user, and off by default.
- The first automatic archival option is **After 1 week** of real chat inactivity.
- Pinned and active-running chats are not eligible for automatic archival.

### 4.6 Real activity

`lastActivityAt` is the ordering and inactivity timestamp for ordinary research. It advances only for real conversation work.

It counts:

- chat creation;
- an accepted user submission;
- persisted Eve events produced by that turn;
- terminal turn events.

It does not count:

- title changes;
- page loads or list reads;
- pin, archive, or recover actions;
- Eve cursor maintenance by itself;
- project metadata changes;
- Lookout scheduling bookkeeping.

Lookout report ordering uses its run or creation time. A Lookout report must not influence the ordinary research sidebar order.

The database clock is authoritative. Writes use `GREATEST(lastActivityAt, database_now)` so concurrent or delayed event batches cannot move activity backward.

## 5. User journeys

### 5.1 Browse a large active history

1. The app loads the 30 most recent active research threads.
2. The user scrolls through the sidebar.
3. Near the bottom, a skeleton appears.
4. MiniScira requests the next page with the server cursor.
5. The new rows join the existing dated groups without duplicates or jumps.
6. The process stops when no next cursor remains.

### 5.2 Open an old thread through search

1. The user opens **Search chats**.
2. Search queries the complete owned history.
3. The user opens an active thread that is not in the loaded sidebar pages.
4. The sidebar shows the thread under **Current chat**.
5. Later pagination removes the temporary copy when the normal row arrives.

### 5.3 Review Lookout history

1. The user opens **Lookouts**.
2. A Lookout with prior runs shows **Latest report** and **View history**.
3. The user opens the history and sees dated reports, newest first.
4. The user opens one report and reads the exact stored result.
5. The normal research sidebar remains unchanged.

### 5.4 Archive and recover research

1. The user archives an ordinary research thread.
2. The row leaves active history after the server confirms the change.
3. The user finds it in **Archived** or through global search.
4. The archived transcript opens read-only.
5. The user recovers it before continuing the conversation.

### 5.5 User stories

- **US-001:** As a user with many threads, I want the sidebar to load recent research first so the app stays responsive.
- **US-002:** As a user browsing history, I want older active research to load as I scroll so I can browse without opening search.
- **US-003:** As a user opening an old search result, I want the current thread to remain visible even when its normal sidebar page is not loaded.
- **US-004:** As a Lookout user, I want reports grouped under their Lookout so automated runs do not crowd ordinary research.
- **US-005:** As a Lookout user, I want each dated report preserved so an email and the application open the same result.
- **US-006:** As a user, I want to archive and recover ordinary research without deleting its content.
- **US-007:** As a user, I want optional automatic archival so inactive research can leave the active list without data loss.
- **US-008:** As a user, I want global search to cover unloaded, archived, and Lookout history so organization does not make information disappear.
- **US-009:** As an operator, I want bounded queries, safe migrations, and private logs so large history remains reliable and secure.

## 6. Scope

### In scope

- Cursor-paginated active sidebar history.
- Bounded requests, retained client metadata, and rendered history rows.
- Loading, error, retry, exhausted, and empty states.
- Current-chat handling outside loaded pages.
- Complete-history title search integration and result labels.
- Distinct Lookout report history.
- Latest successful Lookout report access.
- Failed Lookout run representation.
- Manual archive, recover, and pin state for ordinary research.
- Dedicated cursor-paginated archived view.
- Optional one-week automatic archival.
- Real activity timestamp and active-run protection.
- Ownership, project, and Lookout provenance rules.
- Migration, deployment, observability, and rollback.

### Out of scope

- Message-text search beyond the separate approved thread-search Phase 2 gate.
- Semantic or vector search for history.
- Bulk archive, bulk recover, bulk delete, or retention-based deletion.
- Automatic deletion of archived research or Lookout reports.
- One continuing conversation shared by every run of a Lookout.
- Loading every history row into the browser for client-side filtering.
- User-configurable sidebar page size.
- More automatic archival durations in the first release.
- Pin-based custom sorting or manual drag ordering.
- Cross-user or cross-deployment history.

### Functional requirements

- **FR-001:** Active history must return only owned, non-archived chats that no Lookout run identifies as a report.
- **FR-002:** Active, archived, and Lookout report lists must use bounded cursor pagination.
- **FR-003:** The active sidebar must load 30 rows initially and 30 rows for each later page.
- **FR-004:** Global search must query complete owned history without depending on loaded sidebar pages.
- **FR-005:** An unloaded active current thread must remain visible through a temporary **Current chat** row.
- **FR-006:** Lookout reports must remain separate snapshots grouped by durable run provenance, including after the parent Lookout is deleted.
- **FR-007:** Email and manual-run links must open the exact stored Lookout report.
- **FR-008:** Failed and incomplete Lookout runs must not appear as successful reports.
- **FR-009:** Archive and recovery must preserve transcript, document, artifact, project, and Eve session data.
- **FR-010:** Archived research must stay readable and reject new turns until recovery.
- **FR-011:** Automatic archival must be optional, off by default, bounded, and based on `lastActivityAt`.
- **FR-012:** Automatic archival must exclude pinned research, active runs, recent recoveries, and all Lookout reports.
- **FR-013:** Permanent deletion must remain separate from archive, recovery, Lookout schedule deletion, and automatic archival.
- **FR-014:** Every read and mutation must enforce authenticated ownership in SQL.
- **FR-015:** Sidebar reconciliation must not remount or stop an unrelated live Eve stream.
- **FR-016:** Project chat lists must use the same bounded active-research cursor contract and must not load every project chat.
- **FR-017:** Archived and Lookout report write restrictions must be enforced on the server, not only by hidden UI controls.
- **FR-018:** Search recency, date ranges, and tie-breaking must use the timestamp defined for each history class.

### Technical requirements

- Use PostgreSQL keyset cursor pagination with a stable timestamp and ID order.
- Keep cursors opaque, validated, bounded to one route contract, and free of readable user data.
- Add committed additive migrations and indexes through the explicit migration workflow.
- Use one authoritative real-activity field for ordinary research ordering and archival.
- Use an explicit Lookout run model that survives schedule deletion and identifies report chats without relying on `chat.lookoutId`.
- Use authored Eve schedules and database coordination for automatic archival.
- Reuse public Next.js App Router APIs and standard browser loading patterns.
- Keep list responses to metadata only. Do not return event bodies or report content.
- Preserve the existing PostgreSQL title-search ranking and result caps.
- Verify the real authenticated UI, rendered report timeline, and final answer in production.
- Use a known archive-aware application image for rollback after any row is archived.

## 7. Data and query requirements

### 7.1 Chat lifecycle fields

The implementation must define and migrate fields equivalent to:

- `lastActivityAt`: non-null timestamp for real ordinary research activity;
- `archivedAt`: nullable timestamp;
- `archiveReason`: nullable validated value such as `manual` or `inactivity`;
- `archiveStateChangedAt`: non-null timestamp used to enforce the 24-hour delay after recovery;
- `pinnedAt`: nullable timestamp;
- `activeRunUntil`: nullable timestamp that the server owns to protect research that may still be running.

Existing rows use `updatedAt` as the best available backfill for `lastActivityAt`. The migration must not archive or delete any existing row.

Add a durable Lookout run model with fields equivalent to:

- owner and optional project;
- optional parent Lookout ID;
- immutable Lookout name and schedule identity at run start;
- trigger source: `scheduled`, `manual`, or `retry`;
- status: `claimed`, `running`, `succeeded`, `failed`, or `cancelled`;
- `startedAt`, nullable `finishedAt`, and safe failure code;
- optional report chat ID, with at most one report chat per run.

Create the run record before Eve execution. `claimed` becomes `running` when execution starts. A terminal transition sets `succeeded`, `failed`, or `cancelled` once. A successful run links the persisted report chat. A failed run may link a partial chat only when visible events were safely persisted, and the UI labels that transcript `Incomplete`. A retry creates a new run record and points back to the prior run through an optional retry link.

Existing chats with `lookoutId` must be migrated into successful historical run records before the application stops using `lookoutId` as the only report marker. The migration verifies that deleting a parent Lookout cannot reclassify a report as ordinary research.

`activeRunUntil` is a server-owned lease. The server acquires it atomically when it accepts a user turn, sets an initial 24-hour expiry, and refreshes it when genuine Eve events are persisted. Terminal `turn.completed`, `turn.cancelled`, and terminal failure handling clear it. Browser disconnects do not clear it because Eve work can continue and reconnect. A crash leaves the lease until expiry. Archive mutations and the scheduler check the lease in the same conditional database update that changes archive state.

The server updates `lastActivityAt` when it creates a chat, accepts a user turn, persists a non-empty batch of genuine Eve events, or persists a terminal turn event. Title, cursor-only, archive, recover, pin, and list paths must not update it.

### 7.2 Active sidebar query

The active sidebar query must:

- scope by authenticated `userId`;
- exclude every chat referenced by a Lookout run record;
- include only non-archived rows;
- order by `lastActivityAt DESC, id ASC` or an equivalent stable order;
- return at most `pageSize + 1` rows to detect a next page;
- use a cursor containing both ordering values;
- select list metadata only;
- use an index that matches the ownership, class, archive state, and order predicates.

The cursor must be opaque to the client and validated by the server. A malformed cursor returns `400` without exposing query details.

For `lastActivityAt DESC, id ASC`, a later page uses this exact predicate:

```text
lastActivityAt < cursor.lastActivityAt
OR (lastActivityAt = cursor.lastActivityAt AND id > cursor.id)
```

The cursor also contains the first page's upper boundary. Later pages exclude rows that moved ahead of that boundary. Activity changes can move an unseen row ahead of the cursor. A first-page reload reconciles those rows. The API promises no duplicates and deterministic pages while the ordering values do not change. It does not promise a frozen database snapshot across a long scroll.

Cursors do not expire in this release. A malformed cursor returns `400`. A cursor whose boundary no longer yields rows returns an empty page with `nextCursor: null`.

### 7.3 Archived research query

The archived query must:

- scope by authenticated `userId`;
- exclude every chat referenced by a Lookout run record;
- include archived rows only;
- order by `archivedAt DESC, id ASC`;
- use the same bounded cursor contract;
- return list metadata only.

### 7.4 Lookout report query

The report-history query must:

- authorize ownership through the parent Lookout or persisted report provenance;
- include only the selected Lookout's reports;
- order newest first with a stable ID tie-breaker;
- use bounded cursor pagination;
- distinguish successful, failed, and incomplete runs;
- return list metadata only.

### 7.5 Project history query

Project history uses the active sidebar cursor contract with an additional owned `projectId` predicate. It excludes archived research and Lookout reports. The project UI loads 30 rows initially and 30 rows per later page.

### 7.6 Search query

Global search must:

- query the complete owned history in PostgreSQL;
- apply ownership before ranking;
- return a typed history class for each result;
- preserve the approved title-search limits and ranking;
- never infer eligibility from loaded sidebar state;
- keep result navigation valid for active, archived, and Lookout report rows.

Search timestamps are defined as follows:

- active research uses `lastActivityAt`;
- archived research uses `lastActivityAt` for date-range meaning and ranking tie-breaks, while the UI may also show `archivedAt`;
- Lookout reports use the run record's `startedAt` for date ranges and recency.

An empty search orders all classes by their search timestamp. Non-empty search uses the approved match score first, then the class search timestamp, then stable chat or run ID. This updates the approved thread-search date contract from `updatedAt` to the class-specific timestamps above.

## 8. API contracts

Exact route names may follow nearby repository patterns. The implementation must preserve these operations.

### `GET /api/chats`

Query:

- optional opaque `cursor`;
- optional bounded `limit`, capped by the server.

Response:

- `chats`: active research metadata only;
- `nextCursor`: opaque string or `null`.

The default and maximum page size for this release are 30.

### `GET /api/chats/archived`

Returns one cursor-paginated page of archived ordinary research.

### Project chat route

The project chat-list route returns cursor-paginated active research and uses the same page size and cursor rules as `GET /api/chats`.

### `GET /api/lookouts/:id/reports`

Returns one cursor-paginated page of owned reports for the selected Lookout. The response includes latest-success information or the Lookout list query supplies it without an N+1 query.

### Search route

The existing search route returns a history class and the minimum state needed for a quiet `Archived` or `Lookout` label. It retains the approved maximum result count.

### Lifecycle routes

Owner-scoped archive, recover, pin, and unpin routes must be idempotent. They must return stable `409` error codes for pinned, archived, or actively running states where applicable.

The server returns `409` with a stable code such as `CHAT_ARCHIVED`, `CHAT_PINNED`, `CHAT_ACTIVE`, or `REPORT_READ_ONLY`. Every path that can start, continue, or mutate conversation work must recheck the state in SQL. This includes user-turn acceptance, event append, retry, edit and resubmit, continuation, title mutation, and Eve cursor mutation. Archived research may allow cursor cleanup only when it cannot start or continue work. Lookout reports reject all conversation, title, and cursor mutations after the run reaches a terminal state.

## 9. Sidebar behavior

- Keep the current `Today`, `Yesterday`, and `Earlier` groups.
- Group all loaded pages as one ordered list.
- Do not render duplicate rows after optimistic events, pagination, route changes, or retries.
- Keep the scroll position stable when a page arrives.
- Use an intersection sentinel or an equivalent standard browser pattern to request the next page.
- Prevent parallel requests for the same cursor.
- Abort stale requests when the sidebar unmounts or the authenticated scope changes.
- A failed next-page request keeps existing rows and shows a retry control near the bottom.
- The first-page failure shows a clear sidebar error state and preserves **New research** and **Search chats**.
- Reduced motion must not depend on animated skeletons to communicate loading.
- Collapsed icon mode must not fetch or render the full text list only for visual hiding. The product may keep the loaded page in state, but it must remain bounded.
- On client navigation to an unloaded chat, fetch owner-scoped list metadata for that chat through a small authenticated route. Do not refresh the App Router layout.
- If a loaded row becomes active in the current client, move it to the top and remove its old copy before the next render.
- If another tab archives or updates a row, the current client reconciles on focus, explicit first-page reload, or navigation. Existing later-page cursors are then discarded and rebuilt from the new first page.

## 10. Lookout report behavior

- A report page renders the existing persisted timeline and final answer.
- The page clearly labels the report with its Lookout name and run time.
- The page does not present the report as an ordinary resumable conversation unless a later approved product decision adds that behavior.
- Report history provides empty, loading, error, retry, mixed-success-and-failure, and long-list states.
- A successful scheduled email links to the exact successful report.
- A run that fails before a useful report exists records enough safe status for history and debugging without exposing prompts, content, credentials, or private errors in list responses.
- Deleting a Lookout keeps past reports and their readable provenance.
- The Lookout row shows both the most recent run outcome and a separate link to the latest successful report. A recent failure cannot be hidden by an older success.
- Report provenance uses the Lookout name captured at run start. Renaming the active Lookout does not rewrite old reports.

## 11. Archive and automatic archival

- Archive state stays on the existing `chat` row.
- Archived research remains readable but cannot accept a new turn until recovery.
- Pinned research cannot be manually archived until unpinned.
- Automatic archival is disabled unless the user selects **After 1 week**.
- Eligibility uses `lastActivityAt`, not `updatedAt`.
- An active run, a pin, the 24-hour delay after recovery, or a concurrent new turn prevents archival.
- The scheduler uses an authored Eve schedule and bounded database work.
- The final archive update repeats all eligibility predicates to prevent races.
- Automatic archival never includes Lookout reports. Their organization is controlled by the Lookout report history.
- Automatic archival never calls the permanent delete path.
- Recovery grace lasts 24 hours from `archiveStateChangedAt`. The scheduler requires `archiveStateChangedAt <= database_now - 24 hours`.
- Store the per-user policy as `autoArchiveAfterDays: null | 7` in user settings. `null` means **Off**. One week means exactly 7 times 24 hours in UTC.
- The settings API accepts only `null` or `7` and enforces authenticated ownership. The settings UI offers **Off** and **After 1 week**.
- An hourly authored Eve schedule processes at most 100 eligible rows per tick. Each final update repeats ownership, policy, age, pin, archive, grace, and active-run predicates. A row failure does not stop later rows, and overlapping ticks remain idempotent.
- Pin and unpin actions appear in ordinary active research row actions and open-chat actions. A pinned row shows a quiet pin indicator. Archived research cannot be pinned. Manual archive of a pinned row returns `409 CHAT_PINNED` until the user unpins it.

## 12. Authorization and privacy

- Every list, search, detail, and mutation query scopes by authenticated ownership in SQL.
- Project membership does not replace chat ownership.
- Report history must not disclose another user's Lookout or report through IDs, cursors, counts, or error text.
- Direct links to foreign or missing chats use the repository's safe not-found behavior.
- Pagination cursors contain no readable user data, titles, prompts, or event content.
- Logs may include route, duration, page size, aggregate counts, and opaque run IDs.
- Logs must not include titles, message content, report content, email addresses, prompts, event JSON, or cursor payloads.
- Old thread and Lookout report content remains untrusted source data for agent retrieval.

## 13. Performance requirements

- Initial sidebar data is bounded to 30 rows.
- Every later sidebar, archived, and report-history request is bounded to 30 rows.
- Search retains its approved caps of 20 user results and 8 agent results.
- No history surface performs an unbounded `SELECT` of owned chats.
- No page requires all prior cursors or row counts to request the next page.
- Representative query plans must use the intended ownership and order indexes.
- Tests must cover at least 10,000 synthetic chats for one user and enough second-user rows to prove tenant filtering.
- Browser acceptance must show that the first history page becomes usable before older pages load.

## 14. Acceptance criteria

The stable IDs in this section map to implementation units and named checks in `tasks/todo-scalable-research-history.md`.

### Sidebar pagination

- [ ] **AC-SB-01:** The initial sidebar contains at most 30 active research rows.
- [ ] **AC-SB-02:** Scrolling loads the next page and shows a skeleton while waiting.
- [ ] **AC-SB-03:** Pages join in the correct stable order without gaps or duplicates when the ordered data does not change between requests.
- [ ] **AC-SB-04:** A concurrent insert or activity update does not create duplicate rows. A first-page reload reconciles rows that moved ahead of the active cursor.
- [ ] **AC-SB-05:** A failed page can be retried without clearing existing rows.
- [ ] **AC-SB-06:** The sidebar stops requesting when `nextCursor` is null.
- [ ] **AC-SB-07:** Lookout reports and archived research never appear in active sidebar pages.
- [ ] **AC-SB-08:** The browser retains at most 300 list rows and renders at most 120 rows after a long scroll.
- [ ] **AC-SB-09:** Scrolling into an evicted range fetches its page again without losing the user's position.
- [ ] **AC-SB-10:** Project chat lists load in bounded pages and exclude archived research and Lookout reports.
- [ ] **AC-SB-11:** The real authenticated sidebar works with a large seeded history on desktop and narrow screens.

### Current chat and search

- [ ] **AC-CS-01:** Search finds an owned result outside loaded sidebar pages.
- [ ] **AC-CS-02:** Opening an old active result shows it under **Current chat**.
- [ ] **AC-CS-03:** The temporary row disappears when normal pagination loads the same ID.
- [ ] **AC-CS-04:** Archived and Lookout results show clear quiet labels in search.
- [ ] **AC-CS-05:** Search remains bounded and independent of sidebar state.
- [ ] **AC-CS-06:** Navigation uses the Next.js App Router without a document reload.

### Lookout reports

- [ ] **AC-LR-01:** A scheduled Lookout run creates one separate report snapshot.
- [ ] **AC-LR-02:** The report does not appear in active or archived research lists.
- [ ] **AC-LR-03:** The parent Lookout shows its latest successful report.
- [ ] **AC-LR-04:** Report history loads in bounded pages and orders runs newest first.
- [ ] **AC-LR-05:** An email opens the exact report that produced it.
- [ ] **AC-LR-06:** Failed runs and failed runs with an `Incomplete` transcript label are not labelled as successful reports.
- [ ] **AC-LR-07:** The most recent run outcome remains visible when the latest successful report is older.
- [ ] **AC-LR-08:** Deleting the parent Lookout preserves past reports and readable provenance.
- [ ] **AC-LR-09:** The real scheduled and manual Lookout flows each render the correct timeline and final answer.
- [ ] **AC-LR-10:** Each sidebar Lookout group shows **Current** for the newest report, at most nine older date-and-time labels, and no repeated Lookout-name report labels.
- [ ] **AC-LR-11:** Reports beyond the 10-row sidebar limit remain available through search and paged Lookout history.

### Archive and recovery

- [ ] **AC-AR-01:** Manual archive preserves events, documents, artifacts, project links, and Eve session fields.
- [ ] **AC-AR-02:** Archived research leaves all active list pages and appears in the archived view.
- [ ] **AC-AR-03:** Archived research opens read-only and requires recovery before a new turn.
- [ ] **AC-AR-04:** Recovery returns the row to active history without changing its original activity time.
- [ ] **AC-AR-05:** Pin and active-run rules prevent unsafe archival.
- [ ] **AC-AR-06:** One-week automatic archival is off by default and excludes Lookout reports.
- [ ] **AC-AR-07:** Archive and deletion remain separate in UI, API, scheduler code, and tests.

### Security, migration, and production

- [ ] **AC-SP-01:** Cross-user list, pagination, search, report, archive, recover, and direct-link cases disclose no private metadata.
- [ ] **AC-SP-02:** Existing chats and Lookout reports retain their content and relationships after migration.
- [ ] **AC-SP-03:** Migration checks compare representative event sequences, Eve session fields, continuation tokens, documents and upload references, project links, report provenance, and artifact-bearing events before and after migration.
- [ ] **AC-SP-04:** Query-plan checks pass on representative large data.
- [ ] **AC-SP-05:** Unit, integration, browser, migration, and rollback checks pass.
- [ ] **AC-SP-06:** Production acceptance verifies the real sidebar, search, archive, and Lookout report flows.
- [ ] **AC-SP-07:** Production source control is clean and local `HEAD` equals `origin/main` after deployment.

## 15. Test plan

### Unit tests

Cover:

- cursor encode, decode, validation, and non-expiring behavior;
- stable page predicates for equal timestamps;
- page merge and de-duplication;
- optimistic create, title, archive, recover, and delete events;
- current-chat temporary-row behavior;
- history-class mapping;
- archive eligibility and the 24-hour delay after recovery;
- Lookout report outcome classification.

### Database and API tests

Cover:

- first, middle, and final active-history pages;
- equal timestamps and deterministic ID tie-breaks;
- rows inserted or made active between page requests;
- archived and Lookout exclusions;
- first, middle, and final project-history pages;
- archived and report-history pagination;
- malformed and foreign cursors;
- cross-user IDs and cursors;
- search across unloaded, archived, and Lookout rows;
- latest successful report without N+1 queries;
- parent Lookout deletion with report preservation;
- Lookout run status transitions, retries, zero-report failures, and incomplete transcripts;
- archive, recovery, pin, active-run, and scheduler races;
- server rejection for every archived and report write path;
- migration preservation and indexes.

### Browser checks

Use the existing Browser Use CLI through the Hermes `browser_exec` flow against the real authenticated application. Use Bun component and API tests for deterministic UI state, request, and route coverage. Browser acceptance remains the required proof for user-visible flows. Verify:

- initial bounded sidebar rendering;
- scrolling, skeleton, page arrival, retry, and end state;
- long titles, date groups, keyboard navigation, narrow screens, and reduced motion;
- opening an unloaded old thread through search;
- no live Eve stream interruption when sidebar state changes;
- Lookout latest report, run history, failed run, manual run, and email link;
- manual archive, archived direct link, recovery, and permanent delete separation;
- project history pagination and exclusion rules.

### Load and query-plan checks

Seed at least 10,000 chats for one test user with a mix of active, archived, project, and Lookout rows. Record sanitized `EXPLAIN (ANALYZE, BUFFERS)` output for active history, archived history, report history, and title search. Verify bounded response sizes and stable query time across later pages.

### Model evals

Model evals do not apply to sidebar pagination, report grouping, or archival by themselves. These changes do not alter prompts, tool selection, model routing, or expected generated answers.

Update the thread-search eval suite before the retrieval change lands. Add cases for report inclusion, source labels, ownership, and prompt injection in old report content.

## 16. Deployment and observability

### Deployment

1. Back up the production database.
2. Capture existing chat, event, document, Lookout, and Lookout-report counts.
3. Capture representative relationship checks for event ordering, documents and uploads, projects, Eve session state, and existing Lookout reports.
4. Apply the committed additive migration through the explicit migration workflow. New non-null fields must have safe database defaults while old processes can still write.
5. Deploy archive-aware Next.js and Eve processes before enabling archive mutations or the automatic archive schedule.
6. Verify indexes and query plans before large-history acceptance.
7. Exercise the real authenticated flows with safe fixtures.
8. Monitor pagination, archive, and Lookout scheduler behavior.
9. Commit and push all production-backed repository changes.

### Observability

Record privacy-safe structured data for:

- history route duration, page size, next-page presence, and errors;
- search duration and result count;
- report-history duration and result count;
- archive scheduler scanned, eligible, archived, skipped, and error counts;
- Lookout report success, failure, and duration through existing safe run logging.

Do not add a hosted analytics dependency for this feature.

## 17. Rollback

- Keep migrations additive. Before any row can be archived, preserve a known rollback image that understands archive and report state.
- If pagination fails before archival is enabled, the previous application may be used if migration compatibility was tested.
- After any row is archived, roll back only to the known archive-aware image. An older image that ignores archive state could expose archived rows and accept new turns, so it is not a safe rollback target.
- If automatic archival behaves incorrectly, stop or disable its schedule before repairing state.
- Recover only rows proven to have been archived incorrectly. Do not bulk-recover manual archives.
- If Lookout report classification fails, keep report chats intact and restore the previous readable direct-link behavior.
- Do not merge report chats into one thread during rollback.
- Do not delete reports, archived chats, events, documents, or uploads as a rollback shortcut.
- Restore the database backup only for migration corruption that cannot be repaired forward.

## 18. Ordered work after approval

1. Map every acceptance criterion to implementation TODOs and exact tests.
2. Implement the fixed history-class and durable Lookout run data shape.
3. Add lifecycle fields, constraints, indexes, and migration verification.
4. Add shared cursor pagination helpers and database tests.
5. Add bounded active-history and archived-history APIs.
6. Convert the sidebar to paged loading with stable client-side page merging and refresh behavior.
7. Add current-chat behavior for unloaded active threads.
8. Add typed search labels and preserve complete-history search.
9. Add Lookout latest-report and report-history APIs and UI.
10. Add archive, recover, pin, and read-only archived behavior.
11. Add optional automatic archival and concurrency tests.
12. Run authorization, performance, migration, browser, and production acceptance.
13. Complete deployment documentation and production source-control verification.

The temporary implementation TODO list maps these units to the acceptance checks in Sections 14 and 15.

## 19. Approved recommendations

1. Agent retrieval includes Lookout reports by default with a `Lookout report` label.
2. Real browser acceptance uses the existing Browser Use CLI through Hermes `browser_exec`. Bun component and API tests cover deterministic UI state and route behavior where they apply.
3. The client keeps at most 10 pages or 300 history rows. It renders at most 120 rows. Older pages reload when the user scrolls back to them.

## 20. Approval gate

This PRD supersedes the archive-only draft because pagination, search, archive state, and Lookout report organization share the same history boundaries and queries.

Soham approved this PRD by asking MiniScira to start the scalable research history work. The implementation must follow the approved requirements and the mapped TODO, test, and eval plan.

Keep this approved PRD as the durable specification. Do not use this file for temporary progress tracking.
