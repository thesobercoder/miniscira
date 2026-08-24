import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { PgDialect } from "drizzle-orm/pg-core"

type HistoryModule = typeof import("@/lib/history")
type HistoryCursor = import("@/lib/history").HistoryCursor
type HistoryScope = import("@/lib/history").HistoryScope

let encodeHistoryCursor: HistoryModule["encodeHistoryCursor"]
let historyPageQuery: HistoryModule["historyPageQuery"]
let listHistoryPage: HistoryModule["listHistoryPage"]
let parseHistoryCursor: HistoryModule["parseHistoryCursor"]
let databaseResults: unknown[] = []

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET = "history-test-secret"
  mock.module("server-only", () => ({}))
  mock.module("@/lib/db", () => ({
    db: {
      execute: async () => databaseResults.shift(),
    },
  }))
  ;({
    encodeHistoryCursor,
    historyPageQuery,
    listHistoryPage,
    parseHistoryCursor,
  } = await import("@/lib/history"))
})

beforeEach(() => {
  databaseResults = []
})

const IDS = {
  cursor: "11111111-1111-4111-8111-111111111111",
  upper: "22222222-2222-4222-8222-222222222222",
  project: "33333333-3333-4333-8333-333333333333",
  lookout: "44444444-4444-4444-8444-444444444444",
  report: "55555555-5555-4555-8555-555555555555",
}

function cursor(scope: HistoryScope, userId = "user-1"): HistoryCursor {
  const encoded = encodeHistoryCursor({
    userId,
    scope,
    timestamp: new Date("2026-08-23T12:00:00.000Z"),
    id: IDS.cursor,
    upperBoundary: {
      timestamp: new Date("2026-08-24T12:00:00.000Z"),
      id: IDS.upper,
    },
  })
  const parsed = parseHistoryCursor(encoded)
  if (!parsed) throw new Error("cursor was not parsed")
  return parsed
}

function render(
  scope: HistoryScope,
  value: HistoryCursor | null = null,
  limit = 30
) {
  return new PgDialect().sqlToQuery(
    historyPageQuery({ userId: "user-1", scope, cursor: value, limit })
  )
}

function databaseRow(index: number) {
  const hex = index.toString(16).padStart(12, "0")
  return {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${hex}`,
    title: `Research ${index}`,
    project_id: null,
    history_timestamp: new Date(Date.UTC(2026, 7, 24, 12, 0, -index)),
    archived_at: null,
    lookout_run_id: null,
    report_chat_id: null,
    lookout_run_status: null,
    lookout_run_trigger: null,
    failure_code: null,
  }
}

describe("history cursors", () => {
  test("round-trips opaque cursor data with a private owner binding", () => {
    const value = cursor({ kind: "active", projectId: IDS.project })
    const encoded = encodeHistoryCursor({
      userId: "user-1",
      scope: value.scope,
      timestamp: value.timestamp,
      id: value.id,
      upperBoundary: value.upperBoundary,
    })
    expect(encoded).not.toContain("user-1")
    expect(encoded).not.toContain("2026-08-23")
    expect(parseHistoryCursor(encoded)).toEqual(value)
  })

  test("rejects malformed, future-version, oversized, and report cursors without a Lookout", () => {
    expect(() => parseHistoryCursor("not-json")).toThrow(
      "Invalid history cursor."
    )
    const futureVersion = Buffer.from(
      JSON.stringify({
        version: 2,
        ownerBinding: "a".repeat(64),
        scope: { kind: "active" },
        timestamp: "2026-08-23T12:00:00.000Z",
        id: IDS.cursor,
        upperBoundary: {
          timestamp: "2026-08-24T12:00:00.000Z",
          id: IDS.upper,
        },
      })
    ).toString("base64url")
    expect(() => parseHistoryCursor(futureVersion)).toThrow(
      "Invalid history cursor."
    )
    expect(() => parseHistoryCursor("x".repeat(1025))).toThrow(
      "Invalid history cursor."
    )
    const missingLookout = Buffer.from(
      JSON.stringify({
        version: 1,
        ownerBinding: "a".repeat(64),
        scope: { kind: "lookout-reports" },
        timestamp: "2026-08-23T12:00:00.000Z",
        id: IDS.cursor,
        upperBoundary: {
          timestamp: "2026-08-24T12:00:00.000Z",
          id: IDS.upper,
        },
      })
    ).toString("base64url")
    expect(() => parseHistoryCursor(missingLookout)).toThrow(
      "Invalid history cursor."
    )
  })

  test("rejects cross-scope and cross-user cursor reuse", () => {
    expect(() =>
      historyPageQuery({
        userId: "user-1",
        scope: { kind: "archived" },
        cursor: cursor({ kind: "active" }),
      })
    ).toThrow("History cursor does not match this request.")
    expect(() =>
      historyPageQuery({
        userId: "user-2",
        scope: { kind: "active" },
        cursor: cursor({ kind: "active" }),
      })
    ).toThrow("History cursor does not match this request.")
  })
})

describe("historyPageQuery", () => {
  test("builds the exact active tie and upper-bound predicates", () => {
    const { sql, params } = render(
      { kind: "active" },
      cursor({ kind: "active" })
    )
    expect(sql).toContain(
      "(c.last_activity_at < $4 or (c.last_activity_at = $5 and c.id > $6::uuid))"
    )
    expect(sql).toContain(
      "(c.last_activity_at < $7 or (c.last_activity_at = $8 and c.id >= $9::uuid))"
    )
    expect(sql).toContain("order by c.last_activity_at desc, c.id asc")
    expect(params).toContain("user-1")
    expect(params).toContain(31)
  })

  test("keeps active, archived, and project research owner-scoped and report-free", () => {
    const active = render({ kind: "active" })
    expect(active.sql).toContain("c.user_id =")
    expect(active.sql).toContain("c.archived_at is null")
    expect(active.sql).toContain("c.lookout_id is null")
    expect(active.sql).toContain("not exists")

    const archived = render({ kind: "archived" })
    expect(archived.sql).toContain("c.user_id =")
    expect(archived.sql).toContain("c.archived_at is not null")
    expect(archived.sql).toContain("c.lookout_id is null")

    const project = render(
      { kind: "active", projectId: IDS.project },
      null,
      500
    )
    expect(project.sql).toContain("c.project_id =")
    expect(project.params).toContain(IDS.project)
    expect(project.params.at(-1)).toBe(31)
  })

  test("requires the selected Lookout and returns report navigation metadata", () => {
    const reports = render({ kind: "lookout-reports", lookoutId: IDS.lookout })
    expect(reports.sql).toContain("lr.user_id =")
    expect(reports.sql).toContain("c.user_id = lr.user_id")
    expect(reports.sql).toContain("lr.lookout_id =")
    expect(reports.sql).toContain("c.lookout_id =")
    expect(reports.sql).toContain("lr.report_chat_id")
    expect(reports.sql).toContain("lr.status as lookout_run_status")
    expect(reports.sql).toContain("lr.trigger as lookout_run_trigger")
    expect(reports.sql).toContain("lr.failure_code")
    expect(reports.params).toContain("user-1")
    expect(reports.params).toContain(IDS.lookout)
    expect(reports.params.at(-1)).toBe(31)
  })
})

describe("listHistoryPage", () => {
  test("creates first and middle cursors, reuses the first upper bound, and ends cleanly", async () => {
    databaseResults = [
      { rows: Array.from({ length: 31 }, (_, index) => databaseRow(index)) },
      {
        rows: Array.from({ length: 31 }, (_, index) => databaseRow(index + 30)),
      },
      { rows: [databaseRow(60)] },
    ]

    const first = await listHistoryPage({
      userId: "user-1",
      scope: { kind: "active" },
    })
    expect(first.rows).toHaveLength(30)
    expect(first.nextCursor).not.toBeNull()
    const firstCursor = parseHistoryCursor(first.nextCursor)
    expect(firstCursor?.id).toBe(databaseRow(29).id)
    expect(firstCursor?.upperBoundary.id).toBe(databaseRow(0).id)

    const middle = await listHistoryPage({
      userId: "user-1",
      scope: { kind: "active" },
      cursor: first.nextCursor,
    })
    expect(middle.rows).toHaveLength(30)
    const middleCursor = parseHistoryCursor(middle.nextCursor)
    expect(middleCursor?.id).toBe(databaseRow(59).id)
    expect(middleCursor?.upperBoundary).toEqual(firstCursor?.upperBoundary)

    const final = await listHistoryPage({
      userId: "user-1",
      scope: { kind: "active" },
      cursor: middle.nextCursor,
    })
    expect(final.rows).toHaveLength(1)
    expect(final.nextCursor).toBeNull()
  })

  test("maps exact report chat identity and failed partial-chat metadata", async () => {
    databaseResults = [
      {
        rows: [
          {
            ...databaseRow(1),
            id: IDS.cursor,
            lookout_run_id: IDS.cursor,
            report_chat_id: IDS.report,
            lookout_run_status: "failed",
            lookout_run_trigger: "retry",
            failure_code: "EVE_RUN_FAILED",
          },
        ],
      },
    ]
    const page = await listHistoryPage({
      userId: "user-1",
      scope: { kind: "lookout-reports", lookoutId: IDS.lookout },
    })
    expect(page.rows[0]).toMatchObject({
      id: IDS.cursor,
      lookoutRunId: IDS.cursor,
      reportChatId: IDS.report,
      lookoutRunStatus: "failed",
      lookoutRunTrigger: "retry",
      failureCode: "EVE_RUN_FAILED",
      incomplete: true,
    })
  })
})
