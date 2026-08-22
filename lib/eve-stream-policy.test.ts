import { describe, expect, test } from "bun:test"

import {
  EVE_LONG_RUNNING_STREAM_POLICY,
  reconnectWindowMs,
  shouldReattachSubagent,
} from "./eve-stream-policy"

describe("EVE_LONG_RUNNING_STREAM_POLICY", () => {
  test("keeps a durable research stream recoverable for at least ten minutes", () => {
    expect(
      reconnectWindowMs(
        EVE_LONG_RUNNING_STREAM_POLICY.streamIdleReconnectPolicy
      )
    ).toBeGreaterThanOrEqual(10 * 60 * 1000)
  })

  test("preserves Eve statuses and adds proxy retry statuses", () => {
    expect(EVE_LONG_RUNNING_STREAM_POLICY.retryableErrorStatuses).toEqual(
      expect.arrayContaining([404, 408, 409, 425, 429, 500, 502, 503, 504])
    )
  })
})

describe("shouldReattachSubagent", () => {
  test("reattaches an unfinished stream after its iterator is exhausted", () => {
    expect(shouldReattachSubagent({ aborted: false, completed: false })).toBe(
      true
    )
  })

  test("stops after completion or explicit cancellation", () => {
    expect(shouldReattachSubagent({ aborted: false, completed: true })).toBe(
      false
    )
    expect(shouldReattachSubagent({ aborted: true, completed: false })).toBe(
      false
    )
  })
})
