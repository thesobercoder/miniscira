import { describe, expect, test } from "bun:test"

import {
  beginStreaming,
  clearOptimistic,
  detach,
  READY,
  requestCancel,
  settle,
  submit,
  turnFlags,
} from "@/lib/turn-state"

describe("submit", () => {
  test("paints the optimistic text", () => {
    expect(turnFlags(submit("hello")).pendingUser).toBe("hello")
  })

  test("a new turn is never born cancelling or detached", () => {
    // The regression this guards: Stop pressed on turn N leaving a stale
    // "Stopping…" affordance on turn N+1.
    const stale = detach(requestCancel(beginStreaming(submit("first"))))
    expect(turnFlags(stale).canceling).toBe(true)
    expect(turnFlags(stale).detached).toBe(true)

    const fresh = turnFlags(submit("second"))
    expect(fresh.canceling).toBe(false)
    expect(fresh.detached).toBe(false)
  })
})

describe("beginStreaming", () => {
  test("keeps the optimistic bubble until the server echoes the message", () => {
    const streaming = beginStreaming(submit("hello"))
    expect(turnFlags(streaming).pendingUser).toBe("hello")
    expect(turnFlags(clearOptimistic(streaming)).pendingUser).toBeNull()
  })

  test("carries a pending cancel through into the stream", () => {
    // Stop can be pressed while submitted; the request must survive the
    // transition or the button would appear to un-press itself.
    const canceled = requestCancel(submit("hello"))
    expect(turnFlags(beginStreaming(canceled)).canceling).toBe(true)
  })

  test("clears detached, so a successful re-attach stops warning", () => {
    const reattached = beginStreaming(detach(beginStreaming(submit("hi"))))
    expect(turnFlags(reattached).detached).toBe(false)
  })
})

describe("ready", () => {
  test("READY is fully idle", () => {
    expect(turnFlags(READY)).toEqual({
      isBusy: false,
      canceling: false,
      detached: false,
      pendingUser: null,
    })
  })

  test("transitions that need a running turn are inert once settled", () => {
    // These fire from async tails that can land after the turn settled.
    expect(requestCancel(READY)).toEqual(READY)
    expect(clearOptimistic(READY)).toEqual(READY)
  })
})

describe("settle", () => {
  test("drops the optimistic bubble and the cancel affordance", () => {
    const running = requestCancel(beginStreaming(submit("hello")))
    const flags = turnFlags(settle(running))
    expect(flags.isBusy).toBe(false)
    expect(flags.canceling).toBe(false)
    expect(flags.pendingUser).toBeNull()
  })

  test("carries `detached` past the end of the turn", () => {
    // The regression this guards: the turn ends locally while the agent keeps
    // running server-side, and settling to a clean READY erased the flag
    // before the notice could render.
    const abandoned = detach(beginStreaming(submit("hello")))
    expect(turnFlags(settle(abandoned)).detached).toBe(true)
  })

  test("a detached notice survives until the next question", () => {
    const settled = settle(detach(beginStreaming(submit("first"))))
    expect(turnFlags(settled).detached).toBe(true)
    // Asking something new is what retires it.
    expect(turnFlags(submit("second")).detached).toBe(false)
  })

  test("a clean turn settles fully idle", () => {
    const done = clearOptimistic(beginStreaming(submit("hello")))
    expect(turnFlags(settle(done))).toEqual({
      isBusy: false,
      canceling: false,
      detached: false,
      pendingUser: null,
    })
  })
})

describe("turnFlags", () => {
  test("isBusy covers both active phases", () => {
    expect(turnFlags(submit("x")).isBusy).toBe(true)
    expect(turnFlags(beginStreaming(submit("x"))).isBusy).toBe(true)
    expect(turnFlags(READY).isBusy).toBe(false)
  })
})
