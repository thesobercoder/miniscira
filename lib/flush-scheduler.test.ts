import { describe, expect, test } from "bun:test"

import { createFlushScheduler, nextFlushDelay } from "@/lib/flush-scheduler"

/**
 * A hand-driven clock. Real timers would make these tests race the event loop,
 * and the property under test is purely "which calls collapse into which run".
 */
function fakeTimers() {
  let now = 0
  let nextId = 1
  const queued = new Map<number, { at: number; fn: () => void }>()
  return {
    timers: {
      setTimeout: (fn: () => void, ms: number) => {
        const id = nextId++
        queued.set(id, { at: now + ms, fn })
        return id as unknown as ReturnType<typeof setTimeout>
      },
      clearTimeout: (id: ReturnType<typeof setTimeout>) => {
        queued.delete(id as unknown as number)
      },
    },
    advance(ms: number) {
      now += ms
      for (const [id, t] of [...queued]) {
        if (t.at > now) continue
        queued.delete(id)
        t.fn()
      }
    },
    get scheduled() {
      return queued.size
    },
  }
}

describe("createFlushScheduler", () => {
  test("collapses every call inside one window into a single run", () => {
    const clock = fakeTimers()
    let runs = 0
    const scheduler = createFlushScheduler(() => runs++, 800, clock.timers)

    for (let i = 0; i < 50; i++) scheduler.schedule()
    expect(runs).toBe(0)

    clock.advance(800)
    expect(runs).toBe(1)
  })

  test("does not reset a pending window, so a continuous stream still persists", () => {
    const clock = fakeTimers()
    let runs = 0
    const scheduler = createFlushScheduler(() => runs++, 800, clock.timers)

    // One call every 100ms forever: a resetting debounce would never fire.
    for (let tick = 0; tick < 24; tick++) {
      scheduler.schedule()
      clock.advance(100)
    }
    expect(runs).toBe(3)
  })

  test("opens a fresh window after the previous one fired", () => {
    const clock = fakeTimers()
    let runs = 0
    const scheduler = createFlushScheduler(() => runs++, 800, clock.timers)

    scheduler.schedule()
    clock.advance(800)
    expect(runs).toBe(1)
    expect(scheduler.pending).toBe(false)

    scheduler.schedule()
    expect(scheduler.pending).toBe(true)
    clock.advance(800)
    expect(runs).toBe(2)
  })

  test("cancel drops the pending window without running it", () => {
    const clock = fakeTimers()
    let runs = 0
    const scheduler = createFlushScheduler(() => runs++, 800, clock.timers)

    scheduler.schedule()
    scheduler.cancel()
    expect(scheduler.pending).toBe(false)
    expect(clock.scheduled).toBe(0)

    clock.advance(10_000)
    expect(runs).toBe(0)
  })

  test("cancel is safe with nothing pending", () => {
    const clock = fakeTimers()
    const scheduler = createFlushScheduler(() => {}, 800, clock.timers)
    expect(() => scheduler.cancel()).not.toThrow()
    expect(scheduler.pending).toBe(false)
  })

  /**
   * The default-timers path is the only one that runs in a browser, and it is
   * the one that broke: `{ setTimeout, clearTimeout }` called the globals with
   * the literal as receiver, which `Window.setTimeout` rejects.
   */
  test("runs on the default timers, with nothing injected", async () => {
    let runs = 0
    const scheduler = createFlushScheduler(() => runs++, 1)

    expect(() => scheduler.schedule()).not.toThrow()
    expect(scheduler.pending).toBe(true)

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(runs).toBe(1)
    expect(scheduler.pending).toBe(false)
  })

  test("cancel works on the default timers", async () => {
    let runs = 0
    const scheduler = createFlushScheduler(() => runs++, 1)

    scheduler.schedule()
    expect(() => scheduler.cancel()).not.toThrow()
    expect(scheduler.pending).toBe(false)

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(runs).toBe(0)
  })

  /**
   * Stands in for the browser's WebIDL receiver check, which bun's Node-like
   * globals do not enforce. `Window.setTimeout` accepts only the global as
   * `this` (WebIDL substitutes the relevant global when `this` is undefined,
   * which is what a bare `setTimeout(...)` call in a module produces) and
   * throws `TypeError: Illegal invocation` for anything else — notably a plain
   * object literal that merely holds the function.
   */
  test("survives a browser-strict global whose timers reject a foreign receiver", async () => {
    const realSetTimeout = globalThis.setTimeout
    const realClearTimeout = globalThis.clearTimeout
    const illegal = (name: string) => {
      throw new TypeError(`Illegal invocation: ${name}`)
    }

    globalThis.setTimeout = function strictSetTimeout(
      this: unknown,
      ...args: Parameters<typeof realSetTimeout>
    ) {
      if (this !== undefined && this !== globalThis) illegal("setTimeout")
      return realSetTimeout(...args)
    } as typeof realSetTimeout
    globalThis.clearTimeout = function strictClearTimeout(
      this: unknown,
      ...args: Parameters<typeof realClearTimeout>
    ) {
      if (this !== undefined && this !== globalThis) illegal("clearTimeout")
      return realClearTimeout(...args)
    } as typeof realClearTimeout

    try {
      // Guard: the fake really does reject a plain object as receiver, so a
      // pass below means the scheduler avoids that call shape.
      expect(() => {
        const holder = { setTimeout: globalThis.setTimeout }
        holder.setTimeout(() => {}, 0)
      }).toThrow(TypeError)

      let runs = 0
      const scheduler = createFlushScheduler(() => runs++, 1)
      expect(() => scheduler.schedule()).not.toThrow()

      await new Promise((resolve) => realSetTimeout(resolve, 20))
      expect(runs).toBe(1)

      const cancelled = createFlushScheduler(() => runs++, 1)
      cancelled.schedule()
      expect(() => cancelled.cancel()).not.toThrow()
    } finally {
      globalThis.setTimeout = realSetTimeout
      globalThis.clearTimeout = realClearTimeout
    }
  })
})

describe("nextFlushDelay", () => {
  test("backs off 500ms, 1s, then 2s across the first three retries", () => {
    expect(nextFlushDelay(0)).toBe(500)
    expect(nextFlushDelay(1)).toBe(1000)
    expect(nextFlushDelay(2)).toBe(2000)
  })

  test("gives up once three retries have been scheduled", () => {
    expect(nextFlushDelay(3)).toBeNull()
    expect(nextFlushDelay(4)).toBeNull()
    expect(nextFlushDelay(100)).toBeNull()
  })

  test("never schedules a retry for a negative count", () => {
    expect(nextFlushDelay(-1)).toBeNull()
  })

  test("delays are positive and strictly increasing, so retries cannot spin", () => {
    const delays = [0, 1, 2].map((n) => nextFlushDelay(n))
    for (const delay of delays) expect(delay).toBeGreaterThan(0)
    expect(delays).toEqual([...delays].sort((a, b) => (a ?? 0) - (b ?? 0)))
  })
})
