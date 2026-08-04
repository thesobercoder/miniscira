import { describe, expect, test } from "bun:test"
import { PgDialect } from "drizzle-orm/pg-core"

import {
  appendEventsQuery,
  isUniqueViolation,
  seqConflictAction,
} from "./route"

// Shapes mirror what actually reaches the route: drizzle throws a
// `DrizzleQueryError` whose `cause` is the neon-http `NeonDbError`, and that
// carries the Postgres SQLSTATE on `.code`.
function drizzleQueryError(code: string): Error {
  const driverError = Object.assign(new Error("duplicate key value"), {
    name: "NeonDbError",
    code,
    constraint: "chat_event_chat_id_seq_idx",
  })
  return Object.assign(new Error("Failed query"), { cause: driverError })
}

describe("isUniqueViolation", () => {
  test("detects 23505 on the error itself", () => {
    const bare = Object.assign(new Error("duplicate key"), { code: "23505" })
    expect(isUniqueViolation(bare)).toBe(true)
  })

  test("detects 23505 through drizzle's wrapper cause", () => {
    expect(isUniqueViolation(drizzleQueryError("23505"))).toBe(true)
  })

  test("detects 23505 through a nested sourceError", () => {
    const source = Object.assign(new Error("dup"), { code: "23505" })
    const outer = Object.assign(new Error("neon"), { sourceError: source })
    expect(isUniqueViolation(outer)).toBe(true)
  })

  test("is false for another SQLSTATE", () => {
    // 23503 = foreign_key_violation: a real failure, not a race.
    expect(isUniqueViolation(drizzleQueryError("23503"))).toBe(false)
  })

  test("is false for a plain error, a string, null and undefined", () => {
    expect(isUniqueViolation(new Error("boom"))).toBe(false)
    expect(isUniqueViolation("23505")).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
    expect(isUniqueViolation(undefined)).toBe(false)
  })

  test("terminates on a self-referential cause chain", () => {
    const looped = new Error("loop") as Error & { cause?: unknown }
    looped.cause = looped
    expect(isUniqueViolation(looped)).toBe(false)
  })
})

describe("appendEventsQuery", () => {
  const render = (events: unknown[]) =>
    new PgDialect().sqlToQuery(
      appendEventsQuery("11111111-1111-1111-1111-111111111111", events)
    ).sql

  // Regression guard. `chat_event.created_at` is `not null` and its default is
  // `$defaultFn(() => new Date())` — an application-level default drizzle's
  // query builder supplies, never a database `DEFAULT`. A raw insert that omits
  // the column sends NULL and the row is rejected at runtime with
  // "null value in column \"created_at\" ... violates not-null constraint".
  test("insert names created_at in its column list", () => {
    const columns = /insert into chat_event \(([^)]*)\)/.exec(
      render([{ a: 1 }])
    )
    expect(columns).not.toBeNull()
    const names = (columns?.[1] ?? "").split(",").map((c) => c.trim())
    expect(names).toContain("created_at")
    // The insert's select list must stay the same arity as the column list,
    // otherwise Postgres rejects the statement outright.
    expect(names).toEqual(["chat_id", "seq", "event", "created_at"])
  })

  test("supplies a value for created_at rather than relying on a db default", () => {
    expect(render([{ a: 1 }])).toMatch(/elem\.value,\s*now\(\)/)
  })

  // The pieces the single-statement write path depends on. Ordinality (not
  // row_number) numbers the events in array order; `touched` keeps the sidebar
  // ordering fresh; both live in one statement because neon-http allows only
  // one per request.
  test("keeps ordinality numbering, the touched CTE and the single statement", () => {
    const rendered = render([{ a: 1 }, { b: 2 }])
    expect(rendered).toContain("with ordinality")
    expect(rendered).toContain("update chat set updated_at = now()")
    expect(rendered.split(";").filter((s) => s.trim().length > 0)).toHaveLength(
      1
    )
  })
})

describe("seqConflictAction", () => {
  test("retries the first unique violation", () => {
    expect(seqConflictAction(drizzleQueryError("23505"), 0)).toBe("retry")
  })

  test("gives up with a conflict when the retry also violates", () => {
    expect(seqConflictAction(drizzleQueryError("23505"), 1)).toBe("conflict")
  })

  test("rethrows a non-unique-violation on any attempt", () => {
    expect(seqConflictAction(new Error("connection reset"), 0)).toBe("rethrow")
    expect(seqConflictAction(drizzleQueryError("23503"), 1)).toBe("rethrow")
  })
})
