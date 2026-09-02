"use client"

import type { SessionState } from "eve/client"
import { useCallback, useRef } from "react"
import { useMountEffect } from "@/hooks/use-mount-effect"
import type { ChatEvent } from "@/lib/chat-events"
import {
  createFlushScheduler,
  type FlushScheduler,
  nextFlushDelay,
} from "@/lib/flush-scheduler"

/**
 * How long per-event ingestion waits before persisting.
 *
 * A streamed answer emits an event per token, and an immediate flush per event
 * means a POST as fast as the network round-trips allow. 800ms coalesces a
 * whole burst into one request while staying well under the window a user would
 * notice on reload — and the turn-boundary flush, which is never debounced, is
 * the safety net that makes the delay acceptable.
 */
const FLUSH_INTERVAL_MS = 800

/**
 * The durable half of a chat: buffering agent events and pushing them to
 * `/api/chats/:id`.
 *
 * Deliberately knows nothing about sessions, turns, or projection. It takes
 * events and a chat id and guarantees they land, retrying with a bounded
 * backoff and never dropping a batch the server did not confirm.
 */
export function useEventQueue(initialChatId?: string) {
  const chatIdRef = useRef<string | undefined>(initialChatId)
  const bufferRef = useRef<ChatEvent[]>([])
  const flushingRef = useRef(false)
  const flushPromiseRef = useRef<Promise<void> | null>(null)
  // Retries already scheduled for the current run of failures. Reset the moment
  // a batch lands, so an unrelated blip later starts from the shortest delay.
  const retriesRef = useRef(0)
  // Retry timer only. Kept separate from the batching scheduler below: `flush`
  // clears and resets this one on every failed batch, and doing that to a
  // pending batch window would silently cancel it.
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const schedulerRef = useRef<FlushScheduler | null>(null)

  /**
   * Flush the whole buffer, keeping anything the server did not confirm.
   *
   * INVARIANT: a batch leaves the buffer only on a confirmed 2xx. On a throw or
   * a non-ok status the batch goes back at the *front* (`unshift`, never
   * `push` — the buffer is the transcript's order) and a retry is scheduled
   * with a bounded backoff.
   *
   * Never rejects. Every call site is fire-and-forget or awaited inside a
   * `finally`, so a rejection here would either surface as an unhandled
   * rejection or swallow the caller's return value.
   */
  const flush = useCallback((): Promise<void> => {
    if (flushPromiseRef.current) return flushPromiseRef.current
    const id = chatIdRef.current
    if (!id || bufferRef.current.length === 0) return Promise.resolve()
    flushingRef.current = true
    const running = (async () => {
      try {
        while (bufferRef.current.length > 0) {
          const batch = bufferRef.current.splice(0, bufferRef.current.length)
          let ok = false
          try {
            const res = await fetch(`/api/chats/${id}/events`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ events: batch }),
            })
            ok = res.ok
          } catch {
            ok = false
          }
          if (ok) {
            // Confirmed persisted — only now is dropping the batch safe.
            retriesRef.current = 0
            continue
          }
          // Put it back where it came from and stop; the events are still ours.
          bufferRef.current.unshift(...batch)
          const delay = nextFlushDelay(retriesRef.current)
          if (delay == null) {
            console.error(
              `event flush failed ${retriesRef.current} times; ${bufferRef.current.length} event(s) still buffered`
            )
            break
          }
          retriesRef.current += 1
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null
            void flush()
          }, delay)
          break
        }
      } finally {
        flushingRef.current = false
        flushPromiseRef.current = null
      }
    })()
    flushPromiseRef.current = running
    return running
  }, [])

  /**
   * Buffer an event and persist on a batching window instead of immediately.
   *
   * For the per-event path only: a turn emits an event per token, and one POST
   * each is the application's dominant server cost. Turn boundaries, supersede
   * markers and unmount call `flush()` directly — those must land now.
   */
  const enqueue = useCallback(
    (event: ChatEvent) => {
      bufferRef.current.push(event)
      schedulerRef.current ??= createFlushScheduler(() => {
        void flush()
      }, FLUSH_INTERVAL_MS)
      schedulerRef.current.schedule()
    },
    [flush]
  )

  const persistNow = useCallback(async (
    events: readonly ChatEvent[],
    cursor: SessionState,
    operationId: string
  ): Promise<boolean> => {
    const id = chatIdRef.current
    if (!id) return false
    const operationUrl = `/api/chats/${id}/events?operationId=${encodeURIComponent(operationId)}`
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        const response = await fetch(`/api/chats/${id}/events`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ events, cursor, operationId }),
          signal: AbortSignal.timeout(10_000),
        })
        if (response.ok) return true
        if ([400, 401, 403, 404].includes(response.status)) return false
      } catch {
        // The operation ID makes another POST safe after a lost response.
      }
      if (attempt < 6) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(attempt * 250, 2_000))
        )
      }
    }
    try {
      const response = await fetch(operationUrl, {
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) return false
      const body = (await response.json()) as { accepted?: unknown }
      return body.accepted === true
    } catch {
      return false
    }
  }, [])

  const patchCursor = useCallback(async (cursor: SessionState) => {
    const id = chatIdRef.current
    if (!id || !cursor.sessionId) return
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(`/api/chats/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            eveSessionId: cursor.sessionId,
            continuationToken: cursor.continuationToken,
            streamIndex: cursor.streamIndex,
          }),
        })
        if (response.ok) return
      } catch {
        // Retry below. The cursor is the recovery handle for an accepted turn.
      }
      if (attempt < 3)
        await new Promise((resolve) => setTimeout(resolve, attempt * 250))
    }
    throw new Error("Failed to persist the Eve session cursor")
  }, [])

  /**
   * Clear the persisted session binding so a reload can't rediscover it.
   *
   * Best-effort by design, and the one place a swallowed failure is right: this
   * runs while recovering from a session that is already gone, and the recovery
   * (open a fresh session, resend) does not depend on it. A failure costs a
   * reload rediscovering the dead id and taking the same path again — surfacing
   * it would put an error in front of a user whose message is about to send
   * fine.
   */
  const clearCursor = useCallback(async () => {
    const id = chatIdRef.current
    if (!id) return
    await fetch(`/api/chats/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eveSessionId: null,
        continuationToken: null,
        streamIndex: 0,
      }),
    }).catch(() => {})
  }, [])

  // A scheduled retry must not fire against an unmounted component, and a
  // half-open batch window must not take the tail of the turn with it — drop
  // both timers, then persist what is still buffered.
  useMountEffect(() => () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    retryTimerRef.current = null
    schedulerRef.current?.cancel()
    void flush()
  })

  /** Bind persistence to a chat row created lazily on first send. */
  const setChatId = useCallback((id: string) => {
    chatIdRef.current = id
  }, [])

  return { enqueue, persistNow, flush, patchCursor, clearCursor, setChatId }
}
