import { describe, expect, mock, test } from "bun:test"

const calls: { orderBy: unknown[]; limit: number[] } = {
  orderBy: [],
  limit: [],
}
const newestFirst = Symbol("newest-first")
const query = {
  from: () => query,
  where: () => query,
  orderBy: (...args: unknown[]) => {
    calls.orderBy.push(args)
    return query
  },
  limit: (value: number) => {
    calls.limit.push(value)
    return Promise.resolve([])
  },
}

mock.module("drizzle-orm", () => ({
  desc: () => newestFirst,
  eq: () => Symbol("owner-filter"),
}))
mock.module("next/headers", () => ({ headers: async () => new Headers() }))
mock.module("next/navigation", () => ({ redirect: () => undefined }))
mock.module("@/components/lookouts-view", () => ({
  LookoutsView: () => null,
}))
mock.module("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({ user: { id: "user-1" } }),
    },
  },
}))
mock.module("@/lib/db", () => ({
  db: { select: () => query },
}))
mock.module("@/lib/db/schema", () => ({
  lookout: {
    userId: Symbol("user-id"),
    createdAt: Symbol("created-at"),
  },
}))
mock.module("@/lib/history", () => ({ listHistoryPage: async () => null }))

const { default: LookoutsPage } = await import("@/app/(app)/lookouts/page")

describe("LookoutsPage", () => {
  test("loads only the five newest Lookouts", async () => {
    await LookoutsPage()

    expect(calls.orderBy).toEqual([[newestFirst]])
    expect(calls.limit).toEqual([5])
  })
})
