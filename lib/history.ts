import "server-only"

import { createHmac } from "node:crypto"
import { type SQL, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/lib/db"

export const HISTORY_PAGE_SIZE = 30

const CURSOR_VERSION = 1
const MAX_CURSOR_LENGTH = 1024

export type HistoryScope =
  | { kind: "active"; projectId?: string }
  | { kind: "archived"; projectId?: string }
  | { kind: "lookout-reports"; lookoutId: string }

export type LookoutRunStatus =
  | "claimed"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"

export type LookoutRunTrigger = "scheduled" | "manual" | "retry"

export type HistoryRow = {
  id: string
  title: string
  projectId: string | null
  timestamp: Date
  archivedAt: Date | null
  lookoutRunId: string | null
  reportChatId: string | null
  lookoutRunStatus: LookoutRunStatus | null
  lookoutRunTrigger: LookoutRunTrigger | null
  failureCode: string | null
  incomplete: boolean
}

export type HistoryPage = {
  rows: HistoryRow[]
  nextCursor: string | null
}

type OrderingPair = {
  timestamp: Date
  id: string
}

export type HistoryCursor = OrderingPair & {
  ownerBinding: string
  scope: HistoryScope
  upperBoundary: OrderingPair
}

type DatabaseHistoryRow = {
  id: string
  title: string
  project_id: string | null
  history_timestamp: Date | string
  archived_at: Date | string | null
  lookout_run_id: string | null
  report_chat_id: string | null
  lookout_run_status: LookoutRunStatus | null
  lookout_run_trigger: LookoutRunTrigger | null
  failure_code: string | null
}

const ScopeSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("active"), projectId: z.uuid().optional() })
    .strict(),
  z
    .object({ kind: z.literal("archived"), projectId: z.uuid().optional() })
    .strict(),
  z
    .object({ kind: z.literal("lookout-reports"), lookoutId: z.uuid() })
    .strict(),
])

const CursorWireSchema = z
  .object({
    version: z.literal(CURSOR_VERSION),
    ownerBinding: z
      .string()
      .length(64)
      .regex(/^[0-9a-f]+$/),
    scope: ScopeSchema,
    timestamp: z.iso.datetime(),
    id: z.uuid(),
    upperBoundary: z
      .object({ timestamp: z.iso.datetime(), id: z.uuid() })
      .strict(),
  })
  .strict()

type CursorWire = z.infer<typeof CursorWireSchema>

function scopeEquals(left: HistoryScope, right: HistoryScope) {
  if (left.kind !== right.kind) return false
  if (left.kind === "lookout-reports" && right.kind === "lookout-reports")
    return left.lookoutId === right.lookoutId
  if (left.kind !== "lookout-reports" && right.kind !== "lookout-reports")
    return left.projectId === right.projectId
  return false
}

function ownerBinding(userId: string) {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret)
    throw new Error("BETTER_AUTH_SECRET is required for history cursors.")
  return createHmac("sha256", secret).update(userId).digest("hex")
}

function orderingPredicate(
  timestampColumn: SQL,
  idColumn: SQL,
  cursor: OrderingPair
) {
  return sql`(${timestampColumn} < ${cursor.timestamp} or (${timestampColumn} = ${cursor.timestamp} and ${idColumn} > ${cursor.id}::uuid))`
}

function upperBoundaryPredicate(
  timestampColumn: SQL,
  idColumn: SQL,
  upperBoundary: OrderingPair
) {
  return sql`(${timestampColumn} < ${upperBoundary.timestamp} or (${timestampColumn} = ${upperBoundary.timestamp} and ${idColumn} >= ${upperBoundary.id}::uuid))`
}

function pageLimit(limit: number | undefined) {
  if (!Number.isFinite(limit)) return HISTORY_PAGE_SIZE
  return Math.max(
    1,
    Math.min(HISTORY_PAGE_SIZE, Math.trunc(limit ?? HISTORY_PAGE_SIZE))
  )
}

export function parseHistoryCursor(raw: string | null): HistoryCursor | null {
  if (raw === null) return null
  if (raw.length === 0 || raw.length > MAX_CURSOR_LENGTH)
    throw new Error("Invalid history cursor.")

  try {
    const wire = CursorWireSchema.parse(
      JSON.parse(Buffer.from(raw, "base64url").toString("utf8"))
    )
    return {
      ownerBinding: wire.ownerBinding,
      scope: wire.scope,
      timestamp: new Date(wire.timestamp),
      id: wire.id,
      upperBoundary: {
        timestamp: new Date(wire.upperBoundary.timestamp),
        id: wire.upperBoundary.id,
      },
    }
  } catch {
    throw new Error("Invalid history cursor.")
  }
}

export function encodeHistoryCursor(
  cursor: Omit<HistoryCursor, "ownerBinding"> & { userId: string }
): string {
  const wire: CursorWire = {
    version: CURSOR_VERSION,
    ownerBinding: ownerBinding(cursor.userId),
    scope: cursor.scope,
    timestamp: cursor.timestamp.toISOString(),
    id: cursor.id,
    upperBoundary: {
      timestamp: cursor.upperBoundary.timestamp.toISOString(),
      id: cursor.upperBoundary.id,
    },
  }
  return Buffer.from(JSON.stringify(wire), "utf8").toString("base64url")
}

export function historyPageQuery(input: {
  userId: string
  scope: HistoryScope
  cursor: HistoryCursor | null
  limit?: number
}): SQL {
  const limit = pageLimit(input.limit) + 1
  const cursor = input.cursor
  if (
    cursor &&
    (cursor.ownerBinding !== ownerBinding(input.userId) ||
      !scopeEquals(cursor.scope, input.scope))
  )
    throw new Error("History cursor does not match this request.")

  if (input.scope.kind === "lookout-reports") {
    const timestampColumn = sql`history_timestamp`
    const idColumn = sql`id`
    const after = cursor
      ? sql`and ${orderingPredicate(timestampColumn, idColumn, cursor)} and ${upperBoundaryPredicate(timestampColumn, idColumn, cursor.upperBoundary)}`
      : sql``
    return sql`
      with reports as (
        select lr.id, coalesce(c.title, lr.lookout_name) as title, lr.project_id,
               lr.started_at as history_timestamp, c.archived_at,
               lr.id as lookout_run_id, lr.report_chat_id,
               lr.status as lookout_run_status, lr.trigger as lookout_run_trigger,
               lr.failure_code
        from lookout_run lr
        left join chat c on c.id = lr.report_chat_id and c.user_id = lr.user_id
        where lr.user_id = ${input.userId}
          and lr.lookout_id = ${input.scope.lookoutId}::uuid
        union all
        select c.id, c.title, c.project_id, c.created_at as history_timestamp,
               c.archived_at, null::uuid as lookout_run_id, c.id as report_chat_id,
               'succeeded'::text as lookout_run_status,
               'scheduled'::text as lookout_run_trigger, null::text as failure_code
        from chat c
        where c.user_id = ${input.userId}
          and c.lookout_id = ${input.scope.lookoutId}::uuid
          and not exists (select 1 from lookout_run lr where lr.report_chat_id = c.id)
      )
      select id, title, project_id, history_timestamp, archived_at, lookout_run_id,
             report_chat_id, lookout_run_status, lookout_run_trigger, failure_code
      from reports
      where true ${after}
      order by history_timestamp desc, id asc
      limit ${limit}
    `
  }

  const timestampColumn =
    input.scope.kind === "active" ? sql`c.last_activity_at` : sql`c.archived_at`
  const archiveFilter =
    input.scope.kind === "active"
      ? sql`c.archived_at is null`
      : sql`c.archived_at is not null`
  const after = cursor
    ? sql`and ${orderingPredicate(timestampColumn, sql`c.id`, cursor)} and ${upperBoundaryPredicate(timestampColumn, sql`c.id`, cursor.upperBoundary)}`
    : sql``

  return sql`
    select c.id, c.title, c.project_id, ${timestampColumn} as history_timestamp,
           c.archived_at, null::uuid as lookout_run_id, null::uuid as report_chat_id,
           null::text as lookout_run_status, null::text as lookout_run_trigger,
           null::text as failure_code
    from chat c
    where c.user_id = ${input.userId}
      and ${archiveFilter}
      and (${input.scope.projectId ?? null}::uuid is null or c.project_id = ${input.scope.projectId ?? null}::uuid)
      and c.lookout_id is null
      and not exists (select 1 from lookout_run lr where lr.report_chat_id = c.id)
      ${after}
    order by ${timestampColumn} desc, c.id asc
    limit ${limit}
  `
}

export async function listHistoryPage(input: {
  userId: string
  scope: HistoryScope
  cursor?: string | null
  limit?: number
}): Promise<HistoryPage> {
  const cursor = parseHistoryCursor(input.cursor ?? null)
  const limit = pageLimit(input.limit)
  const result = await db.execute(
    historyPageQuery({
      userId: input.userId,
      scope: input.scope,
      cursor,
      limit,
    })
  )
  const databaseRows = (
    Array.isArray(result) ? result : result.rows
  ) as DatabaseHistoryRow[]
  const rows = databaseRows.slice(0, limit).map((row) => ({
    id: row.id,
    title: row.title,
    projectId: row.project_id,
    timestamp:
      row.history_timestamp instanceof Date
        ? row.history_timestamp
        : new Date(row.history_timestamp),
    archivedAt:
      row.archived_at instanceof Date || row.archived_at === null
        ? row.archived_at
        : new Date(row.archived_at),
    lookoutRunId: row.lookout_run_id,
    reportChatId: row.report_chat_id,
    lookoutRunStatus: row.lookout_run_status,
    lookoutRunTrigger: row.lookout_run_trigger,
    failureCode: row.failure_code,
    incomplete:
      row.lookout_run_status === "failed" && row.report_chat_id !== null,
  }))
  const upperBoundary =
    cursor?.upperBoundary ??
    (rows[0] ? { timestamp: rows[0].timestamp, id: rows[0].id } : null)
  const lastRow = rows.at(-1)
  const nextCursor =
    databaseRows.length > limit && lastRow && upperBoundary
      ? encodeHistoryCursor({
          userId: input.userId,
          scope: input.scope,
          timestamp: lastRow.timestamp,
          id: lastRow.id,
          upperBoundary,
        })
      : null

  return { rows, nextCursor }
}
