# PRD: archive and recover chat threads

- **Status:** Draft — needs explicit user approval before implementation
- **Backlog source:** `docs/PRODUCT_IDEAS.md` → “Archive and recover chat threads”
- **Repository:** `/opt/data/miniscira-src`
- **Primary surfaces:** chat persistence, chat APIs, sidebar/history UI, archived-thread view, user settings, Eve schedules, Lookout execution

## 1. Problem

MiniScira keeps every chat active until the user permanently deletes it. As history grows, the sidebar and project views become crowded, while deletion is too destructive for threads the user may want later.

Add a reversible archive state. Users can manually archive and recover their own threads, browse archived threads in a dedicated view, and optionally enable automatic archival after one week without real chat activity. Archival must preserve the complete thread and remain separate from deletion and future retention policies.

The feature must not infer inactivity from `chat.updatedAt`. Today that field is changed by transcript appends, title edits, Eve cursor persistence, Lookout completion, and other maintenance. A dedicated activity timestamp is required so automatic archival reflects actual conversation activity rather than unrelated database writes.

## 2. goals

- Let a signed-in user archive and unarchive an owned chat without losing messages, events, documents, artifacts, session metadata, project membership, or Lookout provenance.
- Remove archived chats from normal history views and expose them in a dedicated, accessible archived-thread view.
- Offer an opt-in per-user policy with an initial supported threshold of one week of inactivity.
- Define one authoritative inactivity timestamp and update it only for real thread activity.
- Prevent automatic archival of pinned chats, active research runs, and chats conservatively considered needed by a currently running Lookout.
- Preserve strict user ownership checks for every read and mutation.
- Make scheduler execution bounded, idempotent, race-safe, observable, and compatible with the existing Eve/in-database scheduling architecture.
- Deploy the schema and application changes without deleting or rewriting existing thread content.

## 3. Fixed product decisions

These decisions remove implementation ambiguity for the initial release:

1. **Archive is a state on the existing chat row, not a move to another table.** Events and related records retain their existing foreign keys.
2. **Archive and delete remain separate actions.** Archive is reversible; delete remains permanent and retains its existing destructive confirmation.
3. **The initial auto-archive choices are `Off` and `After 1 week`.** The stored shape may support future thresholds, but the UI must not expose unsupported values.
4. **Auto-archive is off by default for existing and new users.** No chat is automatically archived only by deploying the migration.
5. **Pinned threads are an explicit persisted state introduced by this feature.** Pinning protects a thread from auto-archive; it is not a general redesign of sidebar ordering in this release.
6. **A pinned chat cannot be manually archived.** The user must unpin it first. The API returns a typed conflict rather than silently clearing the pin.
7. **A research run that is active cannot be manually or automatically archived.** The archive mutation must fail safely with a typed conflict if a run starts concurrently.
8. **Archived chats are readable but not writable as conversations.** Opening an archived chat shows its transcript and an archived banner; sending, retrying, editing a prior prompt, or otherwise starting a turn requires unarchiving first.
9. **Unarchiving does not count as chat activity and does not rewrite the original activity timestamp.** This preserves accurate inactivity history. The scheduler must provide a grace period by excluding chats whose archive state changed recently, preventing immediate re-archival before the user can resume work.
10. **Direct links to an owned archived chat stay valid.** They render the read-only archived state rather than returning 404 or silently recovering the chat.
11. **Normal chat lists return active chats only by default.** Archived inclusion must be explicit.
12. **Permanent deletion remains available from the archived view with the same warning that messages are permanently removed.** No bulk deletion or retention timer is included.
13. **Manual and automatic archival are distinguishable in persisted metadata** for UI copy, debugging, and observability.
14. **Auto-archive uses UTC instants.** “One week” means 7 × 24 hours since `lastActivityAt`, not a calendar-week boundary or user timezone computation.

## 4. Definitions and rules

### 4.1 Archived

A chat is archived when `archivedAt` is non-null. `archiveReason` is `manual` or `inactivity`. A recovered chat has both fields cleared.

Archiving must not mutate or remove:

- `chat_event` rows;
- uploaded `document` rows or blobs;
- generated artifacts represented in persisted events;
- `eveSessionId`, `continuationToken`, or `streamIndex`;
- `projectId` or `lookoutId`;
- title, visibility, creation time, or conversation activity time.

### 4.2 Real chat activity

`lastActivityAt` is the only timestamp used to determine inactivity. It represents the most recent genuine conversation work in the thread.

It **does count**:

- chat creation, initially using `createdAt`;
- acceptance of a user submission that starts or resumes research;
- persisted Eve events produced by that research turn, including terminal turn-boundary events;
- events produced by a Lookout result run.

It **does not count**:

- title changes;
- pin or unpin actions;
- archive or unarchive actions;
- reads, page loads, sidebar/list fetches, or opening a direct link;
- continuation-token, stream-index, or session-cursor maintenance by itself;
- retries of scheduler/database work that do not append genuine conversation events;
- Lookout schedule bookkeeping such as leases, `lastRunAt`, `nextRunAt`, or status updates;
- project metadata changes, document background processing, or settings changes.

The implementation must centralize activity-touch behavior so raw `updatedAt` writes cannot accidentally become inactivity signals. Existing `updatedAt` may continue to support compatibility and list ordering when useful, but automatic archival must never read it.

### 4.3 Active research run

A chat is active when a persisted, server-owned run lease indicates that a turn may still be running. The implementation must not rely only on browser component state or on whether the last event happens to be a turn boundary.

The run lease must:

- be established before or atomically with accepting a new turn;
- be refreshed by genuine streamed activity;
- be cleared on a terminal Eve turn boundary;
- expire after a conservative safety interval to recover from crashes;
- be checked in the same conditional database update that archives a chat, preventing check-then-update races.

A new turn against an already archived chat must be rejected with a typed `409` response instructing the client to recover it first. The API must not silently unarchive.

### 4.4 Pinned

A chat is pinned when `pinnedAt` is non-null. Pinning is available from active thread actions and is preserved until the user unpins it. For this release, pinning's required behavior is protection from auto-archive and a visible pinned indicator; changing global sidebar sort/order is out of scope.

### 4.5 Needed by a running Lookout

The scheduler must conservatively exclude a Lookout-linked chat when:

- the chat has a non-null `lookoutId`; and
- the linked Lookout currently holds a non-expired execution lease (`leasedUntil > now`).

The active-run lease on the result chat remains the primary protection. The parent-Lookout exclusion is defense in depth for the interval in which the Lookout runner creates, writes, and finalizes result state. It is acceptable for this conservative rule to defer archival of older results from the same Lookout until that run finishes; it is not acceptable to archive a result involved in an active run.

### 4.6 Recovery grace period

To prevent a chat that is still older than the threshold from being re-archived immediately after recovery, auto-archive must exclude chats whose archive state was changed within the prior 24 hours. This can be represented by a dedicated `archiveStateChangedAt` timestamp. Resuming the conversation updates `lastActivityAt` normally and makes the grace period irrelevant.

## 5. user stories

### US-001: persist archive, activity, pin, and run-protection state

**Description:** As a developer, I need explicit thread lifecycle fields so archival is reversible and inactivity is computed correctly.

**Acceptance Criteria:**

- [ ] `chat` stores nullable `archivedAt`, nullable validated `archiveReason`, nullable `pinnedAt`, non-null `lastActivityAt`, non-null `archiveStateChangedAt`, and nullable active-run lease expiry.
- [ ] Existing rows are backfilled safely: `lastActivityAt = updatedAt` as the best available historical approximation, `archiveStateChangedAt = updatedAt`, and archive/pin/run fields are null.
- [ ] The migration does not archive, delete, move, or rewrite chat events, documents, artifacts, project links, Lookout links, or Eve session state.
- [ ] `user_settings` stores nullable `autoArchiveAfterDays`; existing and new users default to null/off.
- [ ] Database constraints reject invalid archive reasons and unsupported/non-positive auto-archive thresholds.
- [ ] Query indexes support active chat lists, archived chat lists, and scheduler candidate scans by owner/state/activity.
- [ ] The generated Drizzle migration and schema snapshot are committed; normal startup does not perform ad hoc schema mutation.
- [ ] Migration applies to a representative pre-feature database and preserves row counts and foreign-key relationships.
- [ ] Typecheck and migration verification pass.

### US-002: maintain correct activity and active-run state

**Description:** As a user, I want automatic archival to reflect actual conversation inactivity so background bookkeeping neither delays archival nor archives work in progress.

**Acceptance Criteria:**

- [ ] Creating a chat initializes `lastActivityAt` from its creation time.
- [ ] Accepting a user turn updates `lastActivityAt` and establishes the active-run lease before the run can be archived.
- [ ] Appending genuine Eve events updates `lastActivityAt`; title/cursor-only mutations do not.
- [ ] Terminal Eve boundaries clear the active-run lease; non-terminal events refresh it.
- [ ] Run-lease expiration is conservative, documented, and covered by tests for crash recovery.
- [ ] Existing cursor persistence in `agent/hooks/persist-session-cursor.ts` cannot update `lastActivityAt`.
- [ ] Lookout result events use the same activity semantics as interactive research.
- [ ] Unit/integration tests distinguish real activity from every listed non-activity example.
- [ ] Typecheck and focused tests pass.

### US-003: manually archive an owned thread

**Description:** As a user, I want to archive a finished thread so it leaves my active history without being deleted.

**Acceptance Criteria:**

- [ ] An Archive action is available from each active chat row and the open chat's thread actions.
- [ ] The action clearly says the thread can be recovered and is visually distinct from Delete.
- [ ] Successful archive sets `archivedAt`, `archiveReason = manual`, and `archiveStateChangedAt` without changing thread content or `lastActivityAt`.
- [ ] The archived row disappears from active sidebar/project/history lists after success without interrupting another chat's live stream.
- [ ] Archiving the currently open thread navigates to `/` only after the server confirms success.
- [ ] Pinned and active-run chats cannot be archived; the UI shows the server's clear conflict message.
- [ ] Repeated archive requests are idempotent and return the current archived state.
- [ ] Network/server failure leaves the row visible and reports an accessible error toast/status.
- [ ] Browser verification covers mouse, keyboard, narrow viewport, loading, success, and failure states.
- [ ] Typecheck and focused tests pass.

### US-004: pin and unpin a thread

**Description:** As a user, I want to protect an important thread from automatic archival.

**Acceptance Criteria:**

- [ ] Active chat actions expose Pin and Unpin controls with labels/tooltips and an accessible pressed/state indication.
- [ ] Pinning persists `pinnedAt`; unpinning clears it; neither changes `lastActivityAt`.
- [ ] Pinned chats show a visible pinned indicator in active history surfaces.
- [ ] A pinned chat's Archive action explains that it must be unpinned first, and the API enforces the same rule.
- [ ] Pin/unpin requests are ownership-scoped and idempotent.
- [ ] Browser verification covers keyboard operation and visible state after reload.
- [ ] Typecheck and focused tests pass.

### US-005: browse archived threads

**Description:** As a user, I want a dedicated view of archived threads so I can find and manage conversations removed from active history.

**Acceptance Criteria:**

- [ ] `/archived` is an authenticated route linked from the sidebar navigation with an archive icon and correct active state.
- [ ] The view lists only the signed-in user's archived chats, newest archive first, with title, last activity date, archived date, reason, project context when available, and Lookout context when available.
- [ ] Active chats do not appear in `/archived`; archived chats do not appear in the normal sidebar, normal `GET /api/chats`, or project chat lists.
- [ ] The view has distinct loading, empty, error, and populated states and stays usable on narrow screens.
- [ ] Each row supports Open, Recover, and Delete; Delete keeps the existing permanent-removal confirmation.
- [ ] Opening an archived chat renders the complete transcript read-only with an archived banner and Recover action.
- [ ] Composer submission, retry, edit/resubmit, and other turn-starting actions are disabled until recovery, with explanatory copy.
- [ ] Browser verification covers accessibility, empty state, long titles, large lists, direct links, and responsive layout.
- [ ] Typecheck and focused tests pass.

### US-006: recover an archived thread

**Description:** As a user, I want to recover an archived thread so I can resume the conversation without losing context.

**Acceptance Criteria:**

- [ ] Recover clears `archivedAt` and `archiveReason`, updates `archiveStateChangedAt`, and preserves all other chat/event/document/session fields.
- [ ] Recovery does not alter `lastActivityAt`; the 24-hour recovery grace prevents immediate automatic re-archival.
- [ ] The recovered row leaves `/archived` and reappears in the appropriate active history/project surface.
- [ ] Recovering from the archived chat page enables the existing composer and turn actions without a destructive remount of any unrelated live stream.
- [ ] Repeated recovery requests are idempotent and return the current active state.
- [ ] Browser verification covers recovery from list and detail views, reload persistence, and failure behavior.
- [ ] Typecheck and focused tests pass.

### US-007: configure one-week auto-archive

**Description:** As a user, I want to opt into automatic archival after one week of inactivity so old history is tidied without deleting it.

**Acceptance Criteria:**

- [ ] Settings contains a “Thread archiving” section with choices Off and After 1 week.
- [ ] Copy states that archival is reversible, based on real chat activity, excludes pinned/running work, and does not delete data.
- [ ] The setting persists per user through the authenticated settings API and survives reload.
- [ ] Invalid values are rejected on the server with `400`; omitted fields do not change.
- [ ] Enabling the setting does not synchronously archive chats in the settings request; the scheduler performs bounded background work.
- [ ] Browser verification covers save progress, success, error rollback, keyboard operation, and mobile layout.
- [ ] Typecheck and focused tests pass.

### US-008: auto-archive eligible inactive threads

**Description:** As an opted-in user, I want an automatic process to archive only eligible inactive threads.

**Acceptance Criteria:**

- [ ] An Eve-authored schedule periodically claims a bounded batch of eligible chats using database predicates and a lease/claim strategy safe under overlapping ticks.
- [ ] Eligibility requires: owner setting equals 7 days, `archivedAt` null, `pinnedAt` null, `lastActivityAt <= now - 7 days`, recovery grace elapsed, active-run lease absent/expired, and no linked Lookout with a live execution lease.
- [ ] The final archive update repeats all eligibility predicates atomically; a concurrent turn, pin, manual state change, or Lookout lease prevents archival.
- [ ] Eligible chats receive `archivedAt = now`, `archiveReason = inactivity`, and `archiveStateChangedAt = now`; content and `lastActivityAt` do not change.
- [ ] The job is idempotent and overlapping ticks cannot produce inconsistent state.
- [ ] One user's setting or rows cannot affect another user's chats.
- [ ] Failure of one candidate does not prevent later candidates from being processed; failures are logged without titles, messages, event payloads, or secrets.
- [ ] Unit tests cover the complete eligibility matrix, exact threshold boundary, overlapping workers, and races with activity/pin/archive/Lookout changes.
- [ ] A database integration test proves the conditional update and ownership boundary.
- [ ] Typecheck and focused tests pass.

### US-009: preserve authorization and deletion boundaries

**Description:** As a user, I need thread lifecycle operations to remain private and deletion to remain explicitly destructive.

**Acceptance Criteria:**

- [ ] Archive, recover, pin, unpin, archived-list, and archived-detail operations require authentication.
- [ ] Every row query and mutation scopes by both chat ID and authenticated `userId`; other users' IDs disclose no metadata or state.
- [ ] Cross-user operations return the repository-standard not-found/forbidden behavior consistently and never mutate rows.
- [ ] Archived content is not exposed through active list APIs, project APIs, activity counts, or scheduler logs beyond intended aggregate counts.
- [ ] Delete still permanently cascades chat events and is never invoked by archive or scheduler code.
- [ ] Authorization tests cover each endpoint and both active/archived states.
- [ ] Typecheck and focused tests pass.

### US-010: deploy, observe, and roll back safely

**Description:** As an operator, I want the feature to deploy and roll back without losing durable user data.

**Acceptance Criteria:**

- [ ] Deployment documentation identifies the migration-first order, required database backup, application rollout, schedule verification, and production acceptance checks.
- [ ] Structured scheduler logs contain run ID, scanned/claimed/archived/skipped/error counts, and duration, but no chat titles/content or user PII.
- [ ] Production acceptance proves manual archive/recovery, active/archived list separation, one-week eligibility, all exclusions, and permanent deletion separation.
- [ ] Rollback instructions distinguish application rollback from schema rollback and explicitly prohibit dropping populated lifecycle columns as a routine rollback.
- [ ] A rollback rehearsal confirms the previous application can run with additive columns present, or documents the required compatibility release strategy.
- [ ] Full repository quality gates and `git diff --check` pass.

## 6. functional requirements

- **FR-1:** The system must represent archival on the existing `chat` row with nullable timestamp and reason fields.
- **FR-2:** Archiving must preserve every child row, blob reference, project/Lookout association, and Eve session field.
- **FR-3:** The system must maintain a dedicated `lastActivityAt` and never use `updatedAt` for auto-archive eligibility.
- **FR-4:** Chat creation, accepted user turns, and persisted genuine Eve events must advance `lastActivityAt` monotonically.
- **FR-5:** Metadata/background writes listed in §4.2 must not advance `lastActivityAt`.
- **FR-6:** Active sidebar and project queries must include `archivedAt IS NULL`.
- **FR-7:** Archived list queries must include `archivedAt IS NOT NULL` and authenticated ownership.
- **FR-8:** `GET /api/chats` must default to active chats; archived access must use an explicit archived endpoint or validated explicit filter, never accidental broadening.
- **FR-9:** The system must expose authenticated, ownership-scoped archive and recover mutations with idempotent results and typed conflicts.
- **FR-10:** The system must expose authenticated, ownership-scoped pin and unpin mutations.
- **FR-11:** A pinned chat must be ineligible for manual and automatic archival until unpinned.
- **FR-12:** An active-run chat must be ineligible for manual and automatic archival.
- **FR-13:** A new turn against an archived chat must return `409` and must not alter events or archive state.
- **FR-14:** Archived chat detail must remain readable to its owner and expose a recovery action.
- **FR-15:** Recovery must clear archive state, preserve conversation data, and start a 24-hour auto-archive grace period without falsifying activity.
- **FR-16:** User settings must persist `Off` or `7 days`; the default must be Off.
- **FR-17:** Scheduler eligibility must apply every predicate in US-008 in the database and recheck it atomically at mutation time.
- **FR-18:** Scheduler work must be bounded per tick and safe under concurrent/overlapping execution through database claims or conditional updates.
- **FR-19:** Scheduler execution must use MiniScira's authored Eve schedule mechanism and database coordination, not QStash or a new external queue.
- **FR-20:** Lookout-linked chats must be excluded while the parent Lookout holds a live execution lease.
- **FR-21:** Automatic archive must set reason `inactivity`; manual archive must set reason `manual`.
- **FR-22:** Archived and active list results must be consistently ordered: active by real activity descending and archived by archive time descending.
- **FR-23:** Permanent delete must remain an explicit `DELETE` path with destructive confirmation and must not share scheduler/archive helper code that could confuse state change with deletion.
- **FR-24:** Cross-user lifecycle reads and writes must not reveal chat title, archive status, pin status, timestamps, or existence beyond current repository authorization conventions.
- **FR-25:** UI state changes must reconcile from server-confirmed state and must not call `router.refresh()` in a way that remounts an unrelated active Eve stream.

## 7. API contract

Exact route naming may follow adjacent conventions, but implementation must preserve these operations and semantics. Recommended routes:

### `GET /api/chats`

- Default response contains active chats only.
- Include lifecycle fields needed by active UI: `id`, `title`, `lastActivityAt`, `pinnedAt`, `projectId` as needed.
- Do not accept an unvalidated arbitrary status string.

### `GET /api/chats/archived`

- Returns only the authenticated user's archived chats.
- Ordered by `archivedAt DESC`, with bounded pagination before production if the query is not already capped.
- Returns list metadata only, never event bodies.

### `POST /api/chats/:id/archive`

- Idempotently archives an owned, active, unpinned, non-running chat.
- Success: `200` with normalized lifecycle state.
- Conflict: `409` with stable code such as `CHAT_PINNED` or `CHAT_ACTIVE`.
- Cross-user/missing: repository-standard rejection with no metadata leak.

### `POST /api/chats/:id/recover`

- Idempotently recovers an owned archived chat and updates archive-state-change time.
- Success: `200` with normalized lifecycle state.

### `POST /api/chats/:id/pin` and `/unpin`

- Idempotent owner-only mutations.
- Pinning an archived chat is rejected for the MVP; recover it first.

### Existing detail/events/cursor/title/delete routes

- Detail GET remains owner-readable for archived chats and includes archive state needed to render read-only UI.
- Event append and any turn-start operation reject archived chats with `409 CHAT_ARCHIVED`.
- Cursor maintenance may continue for a previously running request only while the active-run guard permits it, but it never changes `lastActivityAt` by itself.
- Title edits on archived chats are not required in the MVP and should be disabled/rejected consistently rather than partially supported.
- Delete behavior does not change and ownership-scoped.

### Settings API

- `GET /api/settings` returns normalized `autoArchiveAfterDays: null | 7`.
- `PATCH /api/settings` accepts `autoArchiveAfterDays: null | 7`; invalid values return `400` rather than being silently normalized.
- Existing settings fields and optimistic save behavior remain compatible.

## 8. data model and migration

### 8.1 Proposed fields

`chat` additions:

- `archived_at timestamp null`
- `archive_reason text null` constrained to `manual | inactivity`, and null whenever `archived_at` is null
- `archive_state_changed_at timestamp not null`
- `pinned_at timestamp null`
- `last_activity_at timestamp not null`
- `active_run_until timestamp null`

`user_settings` addition:

- `auto_archive_after_days integer null`, constrained to the supported value `7` for the MVP (or null/off)

### 8.2 Backfill

For all pre-feature chats:

- `last_activity_at = updated_at` because the historical schema cannot reconstruct perfect semantic activity;
- `archive_state_changed_at = updated_at`;
- archive, pin, and active-run fields remain null.

This limitation must be documented: activity is exact after migration and an approximation before it. The backfill intentionally prefers delaying archival over guessing from event payloads or rewriting history.

### 8.3 Constraints and indexes

The migration must add database constraints for archive reason/state consistency and valid settings. Add indexes suited to actual query plans, expected to include:

- active owner history: `(user_id, last_activity_at DESC)` with `archived_at IS NULL` where supported;
- archived owner history: `(user_id, archived_at DESC)` with `archived_at IS NOT NULL`;
- scheduler candidates: `(last_activity_at)` filtered to active/unpinned rows, plus owner lookup through settings;
- existing primary/foreign keys do not change.

Implementation must inspect generated SQL and use an explicit hand-edited migration when Drizzle generation cannot express a needed check/partial index safely.

### 8.4 Migration verification

Use a database fixture containing:

- active standalone chat with events and documents;
- project chat;
- Lookout result chat;
- chat with Eve session cursor;
- multiple users.

Record pre/post counts and representative field values. Verify migration application, repeated migration no-op behavior, constraints, indexes, and that a previous compatible application version tolerates additive columns.

## 9. UI and design

- Reuse existing sidebar menu/action, alert-dialog, button, toast, and settings patterns.
- Archive must use a non-destructive archive icon and neutral copy; Delete retains the destructive icon/color and irreversible warning.
- Row actions must not become an inaccessible icon-only mystery: provide labels or tooltips and accessible names.
- Add `/archived` to `components/sidebar-nav.tsx`; do not put archived rows back into the standard `ChatList` payload.
- `ChatList` must support Archive, Pin/Unpin, and Delete without optimistic state corrupting its existing chat-created/title events.
- If a dedicated row-action menu is introduced, keep keyboard focus, escape behavior, touch targets, and narrow sidebar behavior correct.
- Archived detail banner copy should state: “Archived — recover this thread to continue the conversation.”
- The read-only state must disable all pathways that start a turn, including retry/edit controls, not only the main composer submit button.
- Archived view empty copy should explain how threads get there and link back to new research.
- Dates must use the existing locale-aware presentation conventions and expose exact timestamps accessibly where useful.
- Respect existing motion tokens and reduced-motion behavior; no new one-off easing curves.

## 10. Scheduler and concurrency

- Add a dedicated authored Eve schedule (recommended hourly). Do not overload Lookout claim logic or introduce QStash.
- The scheduled function should call a testable library module, for example `lib/chat-archive-schedule.ts`, rather than embedding SQL/eligibility rules in the schedule file.
- Use bounded batches (initial recommendation: 100 chats per tick) and database conditional updates/claims. The exact batch size may be adjusted from measured query cost without changing product behavior.
- Prefer a single `UPDATE … WHERE id IN (bounded eligible subquery) … RETURNING` or an equivalent claim-and-finalize transaction that repeats all predicates.
- A turn-start mutation must atomically reject archived state and advance `lastActivityAt`/active-run protection before Eve work begins. This and the scheduler's final conditional update define the race outcome: either archival wins and the turn receives `CHAT_ARCHIVED`, or activity wins and archival skips the row. The system must never accept a running turn and archive it simultaneously.
- A concurrent manual archive, recover, pin, or settings-off change must result in a valid final state and must not be overwritten by a stale scheduler candidate list.
- The scheduler must continue after per-row errors and leave rows retryable.
- Expired active-run leases recover from process crashes; fresh leases categorically exclude the row.

## 11. authorization and privacy

- Continue using authenticated route wrappers in `lib/api-auth.ts`.
- Prefer SQL ownership predicates (`id AND user_id`) or a centralized ownership helper; do not rely on client filtering.
- List routes must scope by authenticated user before status filtering and pagination.
- Scheduler joins must derive policy from the same chat owner; never apply one user's settings to another user's rows.
- A user must not infer another user's archive/pin/activity state from status codes or response bodies.
- Logs and metrics may include aggregate counts and opaque run IDs, not chat titles, prompts, event JSON, email, nickname, or document names.
- Archived chats remain private under their existing visibility semantics; archival does not change sharing/visibility.

## 12. Non-goals

- Moving archived data to cold storage, another database/table, or compressed blobs.
- Deleting archived chats automatically or adding retention/expiration policies.
- Bulk archive, bulk recover, bulk delete, or “archive all.”
- More inactivity options than Off and one week in the initial UI.
- User-timezone calendar semantics for the one-week threshold.
- Full-text or semantic search across old threads; that is a separate backlog item.
- Agent retrieval of previous-thread content.
- Project-level or deployment-wide archive policies.
- Sharing/public archive semantics.
- Restoring permanently deleted chats.
- A general notification system for archived threads.
- A broad chat-history/sidebar redesign or pin-based sort reordering.
- Changing Lookout scheduling frequencies or delivery behavior.
- Replacing Eve schedules, database leases, or the existing two-process deployment model.

## 13. test plan and traceability

| Requirement area | Unit tests | Integration/API tests | Browser/real-flow checks |
|---|---|---|---|
| Migration/data preservation (US-001, FR-1–5) | normalization/constraint helpers | migrate representative DB; compare rows/FKs | N/A |
| Activity semantics (US-002, FR-3–5) | activity classification, boundary/run lease logic | create, append events, title/cursor writes; inspect timestamps | start/finish a real research turn and verify eligibility timestamp |
| Manual archive (US-003, FR-9–13) | lifecycle reducer/state helpers | success, idempotency, pinned/active conflicts, ownership | archive sidebar row and current chat; failure states |
| Pinning (US-004, FR-10–12) | pin state helpers | pin/unpin/idempotency/cross-user | pin, reload, attempted archive, unpin |
| Archived view (US-005, FR-6–8, 14, 22) | list grouping/state updates | active versus archived query separation, pagination | empty/populated/direct link/read-only/mobile/keyboard |
| Recovery (US-006, FR-15) | grace-period eligibility | recover/idempotency/preserved fields | recover from list/detail and resume conversation |
| Settings (US-007, FR-16) | validation/normalization | GET/PATCH null/7/invalid/cross-user | save/reload/error rollback |
| Scheduler (US-008, FR-17–21) | full eligibility matrix and boundaries | overlapping tick, exact cutoff, race with activity/pin/Lookout, tenant isolation | enable policy on aged fixtures and trigger schedule |
| Authorization/deletion (US-009, FR-23–24) | N/A | every lifecycle endpoint cross-user; delete cascade remains separate | archived delete warning and permanent result |
| Deployment/ops (US-010) | N/A | migration/rollback rehearsal | production acceptance flow |

### Required focused tests

Implementation should add tests adjacent to the extracted logic, expected to include:

- `lib/chat-archive-policy.test.ts`
- `lib/chat-archive-schedule.test.ts`
- updates to `lib/chat-list-events.test.ts`
- API/database integration coverage for lifecycle routes, settings validation, and tenant boundaries using the repository's chosen integration harness
- migration verification script or documented repeatable commands if no migration-test harness exists

Required scheduler cases:

1. setting off;
2. exactly younger than 7 days;
3. exactly at 7-day cutoff;
4. older than cutoff and otherwise eligible;
5. already archived;
6. pinned;
7. fresh active-run lease;
8. expired active-run lease;
9. Lookout-linked with parent live lease;
10. Lookout-linked with no/expired lease;
11. recovered within 24-hour grace;
12. recovery grace expired;
13. concurrent event/activity update;
14. concurrent pin;
15. concurrent manual archive/recover;
16. multiple users with different settings;
17. repeated and overlapping schedule runs;
18. one candidate failure while later candidates succeed.

### Browser/end-to-end approach

The repository has no Playwright dependency or test script. Do not silently add a large E2E framework solely for this PRD. During implementation, either:

- add the smallest approved browser harness as a separately reviewed testing dependency; or
- execute and document repeatable browser automation against the running app with seeded users/data.

In either case, the final acceptance evidence must exercise the actual authenticated UI and API, not only pure helpers.

### Model evals

**Model evals are N/A.** This feature does not change agent instructions, prompts, tools, retrieval, memory selection, model routing, or expected generated-answer behavior. The relevant risks are database state, scheduling races, authorization, and UI lifecycle behavior, which are better covered by deterministic unit, integration, migration, and browser tests.

If implementation later changes agent-visible context or adds a previous-thread retrieval tool, that expansion requires a separate approved PRD/eval plan with leakage and relevance cases.

## 14. ordered implementation tasks (after approval only)

- [ ] **T-01 — Confirm decisions and test harness.** Resolve open questions, obtain explicit PRD approval, and select the API integration/browser test harness. No production code before approval.
- [ ] **T-02 — Add schema and migration.** Update `lib/db/schema.ts`; generate and inspect a committed migration under `lib/db/migrations/`; add constraints, backfill, and indexes; verify against representative data. Covers US-001.
- [ ] **T-03 — Extract lifecycle/activity policy.** Add testable server helpers for archive eligibility, supported settings, active-run lease semantics, and activity touching; add unit tests. Covers US-002 and scheduler foundations.
- [ ] **T-04 — Wire real activity and run state.** Update chat creation, accepted-turn flow, `app/api/chats/[id]/events/route.ts`, cursor paths, Lookout runner, and terminal-boundary handling without violating the opaque Eve event invariant. Covers US-002.
- [ ] **T-05 — Add settings storage/API.** Extend normalized settings types, `lib/user-settings.ts`, `app/api/settings/route.ts`, provider patch types, validation, and tests for null/7 only. Covers US-007 backend.
- [ ] **T-06 — Add lifecycle APIs and ownership tests.** Implement archive, recover, pin, and unpin routes; extend detail/list payloads; enforce archived write rejection and typed conflicts; add idempotency and cross-user tests. Covers US-003/004/006/009 backend.
- [ ] **T-07 — Filter all active history surfaces.** Update `components/app-sidebar.tsx`, `app/api/chats/route.ts`, project chat queries/APIs, activity queries where intended, and any other discovered history query to exclude archived rows. Add query tests. Covers US-005 list separation.
- [ ] **T-08 — Build active-thread controls.** Extend `components/chat-list.tsx`, chat detail actions, and optimistic list events for Archive and Pin/Unpin while preserving live-stream remount protections. Browser-verify. Covers US-003/004 UI.
- [ ] **T-09 — Build archived list and read-only detail UX.** Add `/archived`, sidebar navigation, archived list component/API consumption, empty/error/loading states, recovery/delete actions, detail banner, and turn-action gating. Browser-verify. Covers US-005/006 UI.
- [ ] **T-10 — Build settings UI.** Add Thread archiving section with Off/After 1 week, explanatory copy, optimistic save/reconciliation, and accessible browser checks. Covers US-007 UI.
- [ ] **T-11 — Implement scheduler.** Add a dedicated schedule under `agent/schedules/` and bounded database library logic; add complete eligibility, race, overlap, failure-isolation, and tenant tests. Covers US-008.
- [ ] **T-12 — Run security and deletion regression.** Verify all cross-user cases, archived detail privacy, project/lookout boundaries, no sensitive logs, and that delete remains permanent/separate. Covers US-009.
- [ ] **T-13 — Migration/deployment rehearsal.** Back up a test database, apply migration, deploy candidate, exercise real authenticated flows and schedule trigger, inspect logs/query plans, and rehearse application rollback. Covers US-010.
- [ ] **T-14 — Full quality gates and traceability review.** Run focused tests, `/opt/data/bin/bun run typecheck`, `/opt/data/bin/bun run lint`, `/opt/data/bin/bun test`, `/opt/data/bin/bun run check`, re-run affected tests after formatter changes, and `git diff --check`; confirm every acceptance criterion has evidence.
- [ ] **T-15 — Production rollout and acceptance.** Back up production DB, migrate, roll out both Next.js and Eve processes, verify schedule registration, run production acceptance with non-sensitive fixtures, monitor first scheduled runs, then commit/push intended changes per repository policy.

## 15. Requirement-to-task traceability

| Story / requirements | Implementation tasks | Verification gate |
|---|---|---|
| US-001; FR-1–2 | T-02 | migration preservation/constraint/index checks |
| US-002; FR-3–5, 12–13 | T-03, T-04 | activity/run-state unit + DB + real-turn checks |
| US-003; FR-9, 11–13, 25 | T-06, T-08 | API conflicts/idempotency + sidebar/current-chat browser flow |
| US-004; FR-10–12 | T-06, T-08 | API ownership/idempotency + reload browser flow |
| US-005; FR-6–8, 14, 22 | T-07, T-09 | query separation + archived list/detail browser matrix |
| US-006; FR-15, 25 | T-06, T-09 | preservation/grace tests + recover/resume browser flow |
| US-007; FR-16 | T-05, T-10 | validation/API tests + settings browser flow |
| US-008; FR-17–21 | T-03, T-11 | eligibility/race/overlap/tenant integration matrix |
| US-009; FR-23–24 | T-06, T-12 | authorization suite + delete regression |
| US-010 | T-13, T-14, T-15 | backup/migrate/rollback/full gates/production acceptance |

## 16. deployment plan

1. **Pre-deploy:** confirm explicit PRD approval; create implementation TODOs; verify clean tree; back up the database; capture chat/chat_event/document counts and representative relationships.
2. **Migration:** apply the committed additive migration using the explicit migration workflow before enabling code paths that require the columns. Do not use normal startup schema mutation.
3. **Application rollout:** deploy a single candidate containing compatible Next.js API/UI and Eve scheduler code. Preserve the two-process image/runtime model.
4. **Schedule verification:** verify the new authored schedule is registered and callable in the deployed Eve runtime. First run with auto-archive off for test users must produce zero changes.
5. **Acceptance fixtures:** use owned test chats covering eligible, pinned, active, Lookout-running, project, and archived states. Do not age or modify real user threads for testing.
6. **Production acceptance:** manually archive/recover; verify active and archived lists; pin protection; read-only archived detail; settings persistence; trigger scheduler for controlled aged fixtures; verify delete remains separate.
7. **Observe:** monitor aggregate schedule counts, errors, duration, database load, and unexpected `409` rates. Inspect logs for accidental titles/content/PII.
8. **Source control:** after successful production deployment, commit every intended change, push to `origin`, and verify clean tree and local HEAD equals `origin/main`.

## 17. rollback plan

- **Preferred rollback:** disable/leave all users' auto-archive settings off if an emergency feature flag is approved, or stop registering the new schedule, then roll back application code to the last compatible image. Manual archive data remains intact.
- **Schema compatibility:** design the migration as additive so the previous application ignores the extra columns. Do not drop lifecycle columns during routine application rollback.
- **State recovery:** if the scheduler archived chats incorrectly, stop the scheduler first, identify affected rows only from `archiveReason = inactivity` and deployment/run timing, take a backup, then use a reviewed owner-safe recovery script. Never bulk-unarchive manual archives.
- **Migration rollback:** dropping columns loses archive/pin/activity audit state and is allowed only after an explicit backup, impact review, and confirmed decision that no populated state is needed. It is not the default rollback.
- **Data restoration:** restore the pre-deploy database backup only for catastrophic migration corruption, understanding that this also discards legitimate post-backup user activity. Prefer forward repair.
- **Verification after rollback:** active chat, existing events, Lookout execution, settings, and deletion must still work; verify both Next.js and Eve processes and inspect schedule registration.

## 18. observability and success metrics

### Operational metrics

- Scheduler runs, duration, candidates scanned/claimed, chats archived, skips by reason, and errors.
- Archive/recover/pin API success and typed-conflict counts without chat/user identifiers.
- Query duration for active sidebar, archived list, and scheduler candidate update.
- Unexpected archived-write `409` rate, which may reveal stale UI or scheduler races.

### Product success criteria

- 100% of manual archive/recover acceptance flows preserve event/document/session counts.
- 0 cross-user lifecycle reads or writes in the authorization suite.
- 0 eligible automatic archives that violate pinned, active-run, Lookout-run, policy-off, threshold, or grace exclusions.
- Archived threads never appear in ordinary sidebar/project lists and active threads never appear in the archived view.
- Users can recover a thread from the archived list or archived detail in at most two deliberate actions.
- Scheduler remains bounded and completes a batch without overlapping-run inconsistency.

No external analytics dependency is required for MVP. Self-hosted operators may rely on privacy-safe structured logs and database checks.

## 19. risks and mitigations

- **Risk: `updatedAt` causes false inactivity decisions.** Mitigation: dedicated `lastActivityAt`, centralized touch helpers, explicit negative tests.
- **Risk: scheduler races with a new turn.** Mitigation: turn-start atomic state update plus final conditional archive update.
- **Risk: stale active state blocks archival forever.** Mitigation: expiring server-owned run lease refreshed by genuine activity and cleared on boundary.
- **Risk: lease expiry archives an unusually long silent run.** Mitigation: conservative lease duration, start-time activity reset, refresh points, and live-run race tests; tune from observed maximum run gaps.
- **Risk: recovering an old chat causes immediate re-archive.** Mitigation: 24-hour archive-state-change grace without falsifying activity.
- **Risk: archived rows leak through a forgotten query.** Mitigation: inventory every `chat` list query, trace project/activity surfaces, and add integration assertions.
- **Risk: auto-archive is confused with deletion.** Mitigation: separate fields/routes/helpers/copy; scheduler never imports delete behavior.
- **Risk: migration affects existing history.** Mitigation: additive nullable fields, deterministic backfill, backup, row-count/FK verification, no initial auto-archive.
- **Risk: optimistic UI remounts a live conversation.** Mitigation: follow existing chat-list event model and avoid broad refreshes during unrelated active streams.

## 20. Open questions that need approval

1. **Pin UI scope:** Is the locked MVP behavior acceptable—pin protects from auto-archive and shows an indicator, but does not reorder the sidebar?
2. **Archived conversation behavior:** Approve read-only-until-recovered, rather than silently recovering on send?
3. **Manual archive of pinned chats:** Approve requiring an explicit unpin first, rather than manual archive overriding the pin?
4. **Recovery grace:** Approve a 24-hour grace while preserving the original `lastActivityAt`?
5. **Archived pagination:** What initial page size should be used? Recommendation: 50 rows with cursor-based pagination if the existing UI/API patterns can support it without scope expansion.
6. **Active-run lease duration:** Select after measuring Eve's longest legitimate silent interval. Recommendation: a conservative 24-hour expiry refreshed by streamed events, because newly accepted turns also reset `lastActivityAt` and therefore cannot meet the 7-day inactivity threshold.
7. **Browser test harness:** Approve adding a small Playwright setup, or require repeatable external browser automation without a repository dependency?
8. **Emergency scheduler disable:** Should deployment add an operator environment flag for the auto-archive schedule, or is removing/disabling schedule registration during rollback sufficient?

## 21. approval gate

This document is a draft. Implementation must not begin until the user explicitly approves the PRD and resolves or accepts the recommendations in §20. After approval, derive the ordered tasks into the execution TODO list and preserve the requirement/test traceability above.
