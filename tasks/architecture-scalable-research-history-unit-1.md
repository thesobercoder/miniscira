# Scalable research history Unit 1 contract

## Caller usage

Server routes request a typed history page with an authenticated user ID, one fixed history scope, an optional project ID, and an optional opaque cursor. The history module validates the cursor once, builds the exact keyset predicate, reads only list metadata, and returns rows plus the next opaque cursor.

Lookout code creates and updates durable run records in later units. Unit 1 only defines the schema and migration that make those transitions possible.

## Data shape

Add these fields to `chat`:

- `lastActivityAt` as a non-null timestamp with a database default of `now()`.
- `archivedAt` as a nullable timestamp.
- `archiveReason` as nullable text constrained to `manual` or `inactivity`.
- `archiveStateChangedAt` as a non-null timestamp with a database default of `now()`.
- `pinnedAt` as a nullable timestamp.
- `activeRunUntil` as a nullable timestamp.

Keep `lookoutId` during the migration and caller transition. Later units stop using it as the report identity after every caller uses `lookout_run`.

Add `lookout_run` with these fields:

- `id` as a UUID primary key.
- `userId` as a required owner reference with cascade delete.
- `lookoutId` as a nullable parent reference with set-null delete.
- `projectId` as a nullable project reference with set-null delete.
- `retryOfRunId` as a nullable self-reference with set-null delete.
- `reportChatId` as a nullable unique chat reference with set-null delete.
- Private companion owner columns for those four nullable references. Composite foreign keys bind each reference to the same `userId`. The companion columns are cleared with the nullable ID when a parent is deleted.
- `lookoutName`, `prompt`, `schedule`, `timezone`, and `frequency` as immutable snapshots.
- `trigger` constrained to `scheduled`, `manual`, or `retry`.
- `status` constrained to `claimed`, `running`, `succeeded`, `failed`, or `cancelled`.
- `startedAt` as a non-null timestamp.
- `finishedAt` as a nullable timestamp.
- `leasedUntil` as a nullable timestamp.
- `leaseOwner` as nullable opaque text.
- `failureCode` as nullable safe text.
- `emailSentAt` as a nullable timestamp.
- `createdAt` and `updatedAt` as non-null timestamps.

The schema uses text plus database checks for fixed values. This matches the repository style and keeps the migration additive.

## Constraints

- `archiveReason` is null or one of the two approved values.
- `trigger` and `status` accept only approved values.
- A report chat belongs to at most one run.
- Parent Lookout, project, retry run, and report chat references belong to the run owner. Composite unique keys on `(id, userId)` and composite foreign keys enforce this in PostgreSQL.
- A retry cannot point to itself.
- `trigger = 'retry'` if and only if `retryOfRunId` is present.
- `finishedAt` is null for `claimed` and `running` rows.
- `finishedAt` is non-null for terminal rows.
- `failureCode` is null unless the status is `failed`.
- `succeeded` requires `reportChatId`. `failed` may link a partial persisted chat. `claimed`, `running`, and `cancelled` cannot link a report chat.
- Lease owner and expiry are both null or both present. Terminal runs have neither.
- `emailSentAt` is present only for a succeeded run with a report chat.

Do not add a chat history-class column. The durable classes derive from `archivedAt` and the existence of a `lookout_run.reportChatId`. During the mixed-version rollout, a chat with `lookoutId` and no run row is still a Lookout report. This fallback prevents old writers from placing new reports in Research. Remove the fallback only after every report writer creates a run row and reconciliation proves no unmatched report chats remain.

## Indexes

Add partial or covering indexes that support these later queries:

- Active research by `userId`, `lastActivityAt DESC`, and `id ASC`, excluding archived rows and report chats.
- Archived research by `userId`, `archivedAt DESC`, and `id ASC`, excluding report chats.
- Active project research by `userId`, `projectId`, `lastActivityAt DESC`, and `id ASC`.
- Report history by `userId`, `lookoutId`, `startedAt DESC`, and `id ASC`.
- Latest run by `lookoutId`, `startedAt DESC`, and `id ASC`.
- Automatic archive selection by `userId`, `lastActivityAt`, with archived, pinned, and active-run predicates supported.

## History module

Create one server-only module such as `lib/history.ts`.

Public types and functions:

```ts
type HistoryScope =
  | { kind: "active"; projectId?: string }
  | { kind: "archived"; projectId?: string }
  | { kind: "lookout-reports"; lookoutId: string }

type HistoryRow = {
  id: string
  title: string
  projectId: string | null
  timestamp: Date
  archivedAt: Date | null
  lookoutRunId: string | null
  reportChatId: string | null
  lookoutRunStatus: "claimed" | "running" | "succeeded" | "failed" | "cancelled" | null
  lookoutRunTrigger: "scheduled" | "manual" | "retry" | null
  failureCode: string | null
  incomplete: boolean
}

type HistoryPage = {
  rows: HistoryRow[]
  nextCursor: string | null
}

function parseHistoryCursor(raw: string | null): HistoryCursor | null
function encodeHistoryCursor(cursor: HistoryCursor): string
function historyPageQuery(input: {
  userId: string
  scope: HistoryScope
  cursor: HistoryCursor | null
  limit?: number
}): SQL
async function listHistoryPage(input: {
  userId: string
  scope: HistoryScope
  cursor?: string | null
  limit?: number
}): Promise<HistoryPage>
```

Keep cursor wire details private. Encode version, scope, ordering timestamp, row ID, the first-page upper boundary, and an HMAC owner binding as base64url JSON. The binding uses the server auth secret and does not expose the user ID. Parse with a boundary schema. Reject malformed, wrong-owner, mismatched-scope, future-version, and overlong values. Report scope validation includes the required selected Lookout ID.

Use a fixed default page size of 30 and a hard maximum of 30. Query `limit + 1` rows.

Active and project pages order by `lastActivityAt DESC, id ASC`. A later page uses this exact predicate:

```text
lastActivityAt < cursor.timestamp
OR (lastActivityAt = cursor.timestamp AND id > cursor.id)
```

The first-page upper boundary uses the first returned row's ordering pair. Every later active page also excludes rows ahead of that pair. Archived pages use `archivedAt`. Report pages use `lookout_run.startedAt` and `lookout_run.id`.

## Migration

Generate one committed Drizzle migration and metadata snapshot.

The migration remains safe while old application processes write:

1. Add chat columns with database defaults or nullable values.
2. Backfill `last_activity_at` and `archive_state_changed_at` from `updated_at`.
3. Create `lookout_run` and constraints.
4. Insert one succeeded historical run for each chat with a non-null `lookout_id`.
5. Copy the chat owner, project, Lookout name, prompt, cron or run time, timezone, and frequency into immutable snapshots.
6. Set `report_chat_id` to the chat ID. Use each chat's creation time as `started_at` and `finished_at`. Do not reuse the parent Lookout's latest run time for several historical chats.
7. Make backfill insertion idempotent through the unique report chat constraint and conflict handling.
8. Add indexes after the backfill.
9. Keep `chat.lookout_id` and all existing relationships unchanged.

The migration verification script compares before and after rows without reading private content. It checks chat IDs, event counts, document links, project links, Eve session fields, and one run per existing Lookout report.

## Tests

Add deterministic tests for:

- Cursor round-trip and opaque output.
- Malformed, wrong-version, wrong-scope, and oversized cursors.
- Exact tie predicate and upper-bound predicate in generated SQL.
- Active, archived, project, and report scope SQL.
- Owner filters and 30-row hard limit.
- Cursor rejection across users without putting a readable user ID in the cursor.
- First, middle, and final page cursor behavior, including tie ordering and upper-bound reuse.
- Report metadata including exact `reportChatId`, status, trigger, failure code, and incomplete classification.
- Migration defaults and fixed-value checks.
- Composite owner foreign keys, run-state, lease, and email checks.
- Historical Lookout report backfill and idempotency.
- Deterministic compatibility checks for the previous chat-create, Lookout-create, raw event append, cursor update, title update, and branch SQL shapes.
- Preservation of chat events, documents, project links, and Eve session fields.

## Synthesis decision

Use the small domain module approach as the base. It hides cursor policy and query rules behind one interface. Graft the stronger lifecycle constraints and durable Lookout snapshots from the run-centric candidate.

Reject a stored `historyClass` field because it duplicates facts and can drift. Reject separate cursor helpers in each route because they repeat security and ordering rules. Reject a generic pagination framework because only three approved history scopes need this contract. Reject removal of `chat.lookoutId` in Unit 1 because old code still writes and reads it.
