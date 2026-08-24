import { describe, expect, test } from "bun:test"
import { PgDialect } from "drizzle-orm/pg-core"

import {
  clampThreadSearchLimit,
  normalizeThreadQuery,
  threadSearchQuery,
  validateThreadSearchDateRange,
} from "@/lib/thread-search"

const render = (
  query: string,
  projectId: string | null = null,
  dateRange: { from: Date; to: Date } | null = null
) =>
  new PgDialect().sqlToQuery(
    threadSearchQuery({
      userId: "user-1",
      query,
      dateRange,
      currentChatId: "11111111-1111-1111-1111-111111111111",
      projectId,
      limit: 8,
    })
  )

describe("normalizeThreadQuery", () => {
  test("normalizes Unicode and whitespace and caps input", () => {
    expect(normalizeThreadQuery("  Ｔhread\n search  ")).toBe("Thread search")
    expect(normalizeThreadQuery("x".repeat(250))).toHaveLength(200)
  })
})

describe("clampThreadSearchLimit", () => {
  test("keeps limits within the caller's maximum", () => {
    expect(clampThreadSearchLimit(undefined, 20)).toBe(20)
    expect(clampThreadSearchLimit(0, 20)).toBe(1)
    expect(clampThreadSearchLimit(99, 20)).toBe(20)
  })
})

describe("validateThreadSearchDateRange", () => {
  test("accepts a half-open UTC range", () => {
    expect(
      validateThreadSearchDateRange({
        from: "2026-08-23T00:00:00.000Z",
        to: "2026-08-24T00:00:00.000Z",
      })
    ).toEqual({
      from: new Date("2026-08-23T00:00:00.000Z"),
      to: new Date("2026-08-24T00:00:00.000Z"),
    })
  })

  test("rejects invalid, reversed and overlong ranges", () => {
    expect(() =>
      validateThreadSearchDateRange({ from: "yesterday", to: "today" })
    ).toThrow("Invalid thread search date range.")
    expect(() =>
      validateThreadSearchDateRange({
        from: "2026-08-24T00:00:00.000Z",
        to: "2026-08-23T00:00:00.000Z",
      })
    ).toThrow("Invalid thread search date range.")
    expect(() =>
      validateThreadSearchDateRange({
        from: "2025-01-01T00:00:00.000Z",
        to: "2026-08-24T00:00:00.000Z",
      })
    ).toThrow("Invalid thread search date range.")
  })
})

describe("threadSearchQuery", () => {
  test("keeps authorization, current thread, project and limits in SQL", () => {
    const { sql, params } = render(
      "postgres search",
      "22222222-2222-2222-2222-222222222222"
    )
    expect(sql).toContain("user_id =")
    expect(sql).toContain("id <>")
    expect(sql).toContain("project_id =")
    expect(sql).toContain("limit")
    expect(params).toContain("user-1")
  })

  test("ranks exact, prefix, full-text and trigram before stable ties", () => {
    const { sql } = render("postgres search")
    expect(sql).toContain("lower(title) =")
    expect(sql).toContain("lower(title) like")
    expect(sql).toContain("plainto_tsquery('simple'")
    expect(sql).toContain("lower(title) %")
    expect(sql).toContain("similarity(lower(title)")
    expect(sql).toContain("order by score desc, updated_at desc, id asc")
  })

  test("disables trigram matching for short queries", () => {
    const { params } = render("pg")
    expect(params).toContain(false)
  })

  test("returns recent threads for an empty query", () => {
    const { sql } = render("  ")
    expect(sql).toContain("'recent'::text")
    expect(sql).toContain("order by updated_at desc, id asc")
    expect(sql).not.toContain("websearch_to_tsquery")
  })

  test("keeps inclusive-from and exclusive-to date filters in SQL", () => {
    const from = new Date("2026-08-23T00:00:00.000Z")
    const to = new Date("2026-08-24T00:00:00.000Z")
    const { sql, params } = render("", null, { from, to })
    expect(sql).toContain("updated_at >=")
    expect(sql).toContain("updated_at <")
    expect(params).toContain(from)
    expect(params).toContain(to)
    expect(params).toContain("user-1")
  })

  test("combines title, owner, project and date filtering", () => {
    const { sql } = render("postgres", "22222222-2222-2222-2222-222222222222", {
      from: new Date("2026-08-23T00:00:00.000Z"),
      to: new Date("2026-08-24T00:00:00.000Z"),
    })
    expect(sql).toContain("user_id =")
    expect(sql).toContain("project_id =")
    expect(sql).toContain("updated_at >=")
    expect(sql).toContain("title_search @@")
  })
})
