/** Backoff before each successive retry of a failed event flush. */
const FLUSH_RETRY_DELAYS = [500, 1000, 2000] as const

type SchedulerTimers = {
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void
}

export type FlushScheduler = {
  /** Coalesce this call into the pending window, opening one if there is none. */
  schedule(): void
  /** Drop a pending window without running it. */
  cancel(): void
  readonly pending: boolean
}

/**
 * Coalesce any number of `schedule()` calls into one `run()` per window.
 *
 * INVARIANT: a pending timer is never reset. Resetting would turn this into a
 * trailing debounce, and under a continuous token stream — where the next event
 * always arrives before the window closes — nothing would persist until the
 * stream stopped. The first call in a window fixes when that window ends.
 *
 * Timers are injectable so the coalescing can be tested without real time.
 *
 * The default timers wrap the globals in arrows rather than passing the bare
 * references. `{ setTimeout }` would call the method with `this === timers`,
 * and the WebIDL definition of `Window.setTimeout` rejects any receiver that is
 * not the Window — in a browser that throws `TypeError: Illegal invocation` and
 * kills the whole turn.
 */
export function createFlushScheduler(
  run: () => void,
  delayMs: number,
  timers: SchedulerTimers = {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
  }
): FlushScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    schedule() {
      if (timer !== null) return
      timer = timers.setTimeout(() => {
        timer = null
        run()
      }, delayMs)
    },
    cancel() {
      if (timer !== null) timers.clearTimeout(timer)
      timer = null
    },
    get pending() {
      return timer !== null
    },
  }
}

/**
 * How long to wait before retrying a failed flush, or `null` to give up.
 *
 * `retriesScheduled` is how many retries this run of consecutive failures has
 * already queued, so the first failure gets the shortest delay. Bounded on
 * purpose: a permanently failing endpoint (a 403, a dead deploy) must not spin.
 * Giving up keeps the events buffered — they are retried by the next flush.
 */
export function nextFlushDelay(retriesScheduled: number): number | null {
  if (retriesScheduled < 0) return null
  return FLUSH_RETRY_DELAYS[retriesScheduled] ?? null
}
