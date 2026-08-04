import { describe, expect, test } from "bun:test"

import { nextRunFromCron } from "@/lib/lookout-schedule"

// 2026-07-31 is a Friday (UTC day 5). Every `now` below is explicit — these
// tests never read the real clock.
const DAILY = "30 9 * * *"
const FRIDAY = "30 9 * * 5"

const iso = (value: Date | null) => value?.toISOString() ?? null

describe("nextRunFromCron — daily", () => {
  test("before today's slot fires today", () => {
    const now = new Date("2026-07-31T08:00:00.000Z")
    expect(iso(nextRunFromCron(DAILY, now))).toBe("2026-07-31T09:30:00.000Z")
  })

  test("after today's slot fires tomorrow", () => {
    const now = new Date("2026-07-31T10:00:00.000Z")
    expect(iso(nextRunFromCron(DAILY, now))).toBe("2026-08-01T09:30:00.000Z")
  })
})

describe("nextRunFromCron — weekly", () => {
  test("on the target day before the slot fires today, not in seven days", () => {
    const now = new Date("2026-07-31T08:00:00.000Z")
    expect(iso(nextRunFromCron(FRIDAY, now))).toBe("2026-07-31T09:30:00.000Z")
  })

  test("on the target day after the slot fires exactly seven days out", () => {
    const now = new Date("2026-07-31T10:00:00.000Z")
    expect(iso(nextRunFromCron(FRIDAY, now))).toBe("2026-08-07T09:30:00.000Z")
  })

  test("dow=0 and dow=7 both resolve to Sunday", () => {
    const now = new Date("2026-07-31T10:00:00.000Z")
    const zero = nextRunFromCron("30 9 * * 0", now)
    const seven = nextRunFromCron("30 9 * * 7", now)
    expect(zero?.getUTCDay()).toBe(0)
    expect(iso(seven)).toBe(iso(zero))
    expect(iso(zero)).toBe("2026-08-02T09:30:00.000Z")
  })
})

describe("nextRunFromCron — malformed input", () => {
  test("returns null for a cron with four fields", () => {
    expect(
      nextRunFromCron("30 9 * *", new Date("2026-07-31T08:00:00.000Z"))
    ).toBe(null)
  })

  test("returns null for a step expression in the minute slot", () => {
    const result = nextRunFromCron(
      "*/5 9 * * *",
      new Date("2026-07-31T08:00:00.000Z")
    )
    expect(result).toBe(null)
    // Explicitly not a NaN date.
    expect(Number.isNaN(Number(result))).toBe(false)
  })
})
