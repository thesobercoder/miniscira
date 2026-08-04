"use client"

import {
  Client,
  type defaultMessageReducer,
  type EveMessageData,
  type EveMessagePart,
} from "eve/client"
import { useCallback, useMemo, useRef, useState } from "react"

import { useMountEffect } from "@/hooks/use-mount-effect"
import {
  asEveEvent,
  type ChatEvent,
  eventType,
  subagentCallId,
} from "@/lib/chat-events"
import {
  collectSubagentCalls,
  EMPTY_MESSAGE_DATA,
  reduceSubagentEvents,
  type SubagentCall,
} from "@/lib/subagent-stream"

/**
 * How often a delegate's accumulated projection is published to React.
 *
 * A delegate replays 1000+ events (mostly token deltas), and one setState per
 * event is thousands of updates in a tight loop — React aborts that with
 * "Maximum update depth exceeded".
 */
const PUBLISH_INTERVAL_MS = 120

type Reducer = ReturnType<typeof defaultMessageReducer>

/**
 * Delegated subagent transcripts, streamed and projected per call id.
 *
 * These run as their own workflow runs, so nothing reaches the parent stream:
 * `subagent.called` only hands over a `childSessionId` and the client has to
 * read that session itself. Split out of `useEveChat` because none of it
 * touches the parent's session, cursor, or turn state — it only needs a
 * reducer and the initial log.
 */
export function useSubagentStreams({
  reducer,
  initialEvents,
}: {
  reducer: Reducer
  initialEvents: readonly ChatEvent[]
}) {
  const [childData, setChildData] = useState<Record<string, EveMessageData>>(
    () => reduceSubagentEvents(reducer, initialEvents.map(asEveEvent))
  )
  // Child sessions we've attached to, mapped to their abort controllers so the
  // streams can be torn down on unmount. Keyed by callId; the value is null once
  // that delegate's stream has finished (the key stays as the "already
  // attached" marker — see attach).
  const attachedRef = useRef<Map<string, AbortController | null>>(new Map())
  // Delegates that already finished. Decides whether attaching should follow
  // the live stream or just catch up to the durable tail.
  const doneCallsRef = useRef<Set<string>>(
    new Set(
      initialEvents
        .filter((e) => eventType(e) === "subagent.completed")
        .map(subagentCallId)
        .filter((id): id is string => id != null)
    )
  )
  const clientRef = useRef<Client | null>(null)

  const attach = useCallback(
    (call: SubagentCall) => {
      if (attachedRef.current.has(call.callId)) return
      const ac = new AbortController()
      attachedRef.current.set(call.callId, ac)

      void (async () => {
        let acc: EveMessageData = EMPTY_MESSAGE_DATA
        let lastPublish = 0
        try {
          clientRef.current ??= new Client({
            host: "",
            preserveCompletedSessions: true,
          })
          // Must be a SessionState, not a bare string: `session("…")` reads a
          // string as a *continuationToken*, which leaves sessionId unset and
          // fails with "Session has no session ID. Send a message first."
          const child = clientRef.current.session({
            sessionId: call.childSessionId,
            streamIndex: 0,
          })
          for await (const e of child.stream({
            startIndex: 0,
            // Follow a delegate that is still working, so its steps appear as
            // they happen; for one that already finished (or on reload), read
            // to the durable tail and stop rather than hold a socket open.
            follow: !doneCallsRef.current.has(call.callId),
            signal: ac.signal,
            streamReconnectPolicy: { reconnect: false },
          })) {
            acc = reducer.reduce(acc, e)
            const now = Date.now()
            if (now - lastPublish > PUBLISH_INTERVAL_MS) {
              lastPublish = now
              const snapshot = acc
              setChildData((prev) => ({ ...prev, [call.callId]: snapshot }))
            }
          }
          // Final flush so the last events always land.
          const final = acc
          setChildData((prev) => ({ ...prev, [call.callId]: final }))
        } catch (err) {
          if ((err as Error)?.name !== "AbortError")
            // A delegate's transcript is a nice-to-have — never break the turn.
            console.warn("subagent stream", call.callId, err)
        } finally {
          // Release the controller but KEEP the key: its presence is what stops
          // a re-announced `subagent.called` from attaching a second stream to
          // the same delegate.
          attachedRef.current.set(call.callId, null)
        }
      })()
    },
    [reducer]
  )

  /** Fold an inline subagent's forwarded event into that delegate's projection. */
  const ingestChild = useCallback(
    (callId: string, event: Parameters<Reducer["reduce"]>[1]) => {
      setChildData((prev) => ({
        ...prev,
        [callId]: reducer.reduce(prev[callId] ?? EMPTY_MESSAGE_DATA, event),
      }))
    },
    [reducer]
  )

  const markDone = useCallback((callId: string) => {
    doneCallsRef.current.add(callId)
  }, [])

  // Delegates already in the persisted history have no live event to trigger on,
  // so replay them once. Streams are torn down on unmount.
  useMountEffect(() => {
    for (const call of collectSubagentCalls(initialEvents.map(asEveEvent)))
      attach(call)
    return () => {
      for (const ac of attachedRef.current.values()) ac?.abort()
      attachedRef.current.clear()
    }
  })

  // Flatten each subagent's projection down to the parts the timeline renders,
  // keyed by the parent call id.
  const childParts = useMemo(() => {
    const out: Record<string, readonly EveMessagePart[]> = {}
    for (const [callId, d] of Object.entries(childData)) {
      const parts = d.messages.flatMap((m) => m.parts)
      if (parts.length > 0) out[callId] = parts
    }
    return out
  }, [childData])

  return { childParts, attach, ingestChild, markDone }
}
