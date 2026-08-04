import { sql } from "drizzle-orm"
import { NextResponse } from "next/server"

import { authedWithParams } from "@/lib/api-auth"
import { requireOwnedChat } from "@/lib/api-ownership"
import { db } from "@/lib/db"

// Postgres `unique_violation`. Raised by the `chat_event_chat_id_seq_idx`
// unique index when a concurrent flush already claimed these `seq` values.
const UNIQUE_VIOLATION = "23505"

// How many times the batch insert may be attempted before giving up with 409.
const MAX_ATTEMPTS = 2

/**
 * True when `error` (or anything in its cause chain) is a Postgres
 * unique-violation.
 *
 * Drizzle wraps driver errors in `DrizzleQueryError`, whose `cause` is the
 * `NeonDbError` carrying the SQLSTATE on `.code`; `NeonDbError` in turn can
 * carry a `sourceError`. Walking the chain keeps this working whichever layer
 * happens to surface.
 *
 * @public Exported for unit tests; not a route handler export.
 */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; current != null && depth < 8; depth++) {
    const candidate = current as {
      code?: unknown
      cause?: unknown
      sourceError?: unknown
    }
    if (candidate.code === UNIQUE_VIOLATION) return true
    current = candidate.cause ?? candidate.sourceError
  }
  return false
}

export type SeqConflictAction = "retry" | "conflict" | "rethrow"

/**
 * The whole retry policy as one pure decision, so it can be tested without a
 * database: a first unique violation is retried (the retry recomputes
 * `max(seq)` and lands after the winner's rows), a second one is reported as a
 * conflict, and anything that is not a unique violation is not our problem.
 *
 * @param attempt zero-based index of the attempt that just failed.
 * @public Exported for unit tests; not a route handler export.
 */
export function seqConflictAction(
  error: unknown,
  attempt: number
): SeqConflictAction {
  if (!isUniqueViolation(error)) return "rethrow"
  return attempt < MAX_ATTEMPTS - 1 ? "retry" : "conflict"
}

// POST /api/chats/:id/events — append a batch of eve stream events.
// The client flushes new events from `useEveAgent`'s onEvent so the thread can
// be rehydrated later via `initialEvents`.
export const POST = authedWithParams<{ id: string }>(
  async (request, { userId, params: { id } }) => {
    const owned = await requireOwnedChat(id, userId)
    if ("error" in owned) return owned.error

    const body = (await request.json().catch(() => ({}))) as {
      events?: unknown[]
    }
    const events = Array.isArray(body.events) ? body.events : []
    if (events.length === 0) {
      return NextResponse.json({ ok: true, appended: 0 })
    }

    // `(chat_id, seq)` is unique, so a flush that loses a race against another
    // writer fails with 23505 rather than interleaving the transcript. Retrying
    // re-runs the statement below, which recomputes `max(seq)` and therefore
    // lands after the winner's rows.
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const appended = await appendEvents(id, events)
        return NextResponse.json({ ok: true, appended })
      } catch (error) {
        const action = seqConflictAction(error, attempt)
        if (action === "rethrow") throw error
        if (action === "conflict") break
      }
    }

    // Sustained contention on this chat. 409 rather than 500 because the batch is
    // intact and the write is still valid — the client's flush queue treats a
    // non-2xx as "requeue" and comes back with backoff.
    return NextResponse.json(
      { error: "Concurrent write conflict; retry" },
      { status: 409 }
    )
  },
  // Unmetered. `useEventQueue` flushes on an 800ms window, so a single long
  // turn drives up to ~75 POSTs a minute here with no user action behind them.
  // Counting those would force `RATE_LIMIT_PER_MINUTE` above the app's own idle
  // traffic before it could brake anything — and a 429 on this path costs the
  // transcript: the queue retries on a bounded backoff, then gives up, and an
  // unmount while still over budget drops the buffered events for good.
  { metered: false }
)

// One statement for the whole write path. `lib/db` is the Neon HTTP driver,
// which opens a fresh HTTP round trip per query, so the old
// max(seq) → insert → touch sequence cost three of them per batch.
//
// `with ordinality` (not `row_number() over ()`) numbers the elements: it is
// defined to follow the array's own order, so seq mirrors the transcript.
//
// The `touched` CTE keeps `chat.updatedAt` moving — the sidebar orders chats
// by it — without a second round trip. A data-modifying CTE always runs to
// completion whether or not the primary query reads its output.
//
// Because it is a single statement it is also a single implicit transaction:
// a unique violation on any row rolls the whole batch back, so a retry never
// double-writes the rows that did succeed.
//
// `created_at` is listed explicitly: the schema declares it with
// `$defaultFn(() => new Date())`, which is an application-level default applied
// by drizzle's query builder — it is *not* a database `DEFAULT`. A raw insert
// that omits the column therefore sends NULL into a `not null` column. `now()`
// matches the intent of `$defaultFn`.
//
// @public Exported for unit tests; not a route handler export.
export function appendEventsQuery(id: string, events: unknown[]) {
  return sql`
    with inserted as (
      insert into chat_event (chat_id, seq, event, created_at)
      select ${id}::uuid,
             (coalesce(
                (select max(seq) from chat_event where chat_id = ${id}::uuid),
                -1
              ) + elem.ord)::int,
             elem.value,
             now()
      from jsonb_array_elements(${JSON.stringify(events)}::jsonb)
        with ordinality as elem(value, ord)
      returning 1 as one
    ), touched as (
      update chat set updated_at = now() where id = ${id}::uuid
    )
    select count(*)::int as appended from inserted
  `
}

async function appendEvents(id: string, events: unknown[]): Promise<number> {
  const result = await db.execute(appendEventsQuery(id, events))

  const rows = (Array.isArray(result) ? result : result.rows) as {
    appended: number
  }[]

  return rows[0]?.appended ?? events.length
}
