"use client"

import type { defaultMessageReducer, EveMessageData } from "eve/client"
import { useCallback, useMemo, useRef, useState } from "react"

import {
  asEveEvent,
  type ChatEvent,
  eventId,
  eventType,
  isSessionStart,
  isSupersedeEvent,
  SUPERSEDE_EVENT,
  scopeSessions,
  withSessionScope,
} from "@/lib/chat-events"
import {
  annotateEvent,
  annotateEvents,
  isAnnotatedEvent,
  type TurnAnnotations,
} from "@/lib/turn-annotations"

type Reducer = ReturnType<typeof defaultMessageReducer>

function reduceEvents(reducer: Reducer, events: readonly ChatEvent[]) {
  let data = reducer.initial()
  for (const event of events) data = reducer.reduce(data, asEveEvent(event))
  return data
}

function collectSuperseded(events: readonly ChatEvent[]): Set<string> {
  const ids = new Set<string>()
  for (const event of events) {
    if (!isSupersedeEvent(event)) continue
    for (const id of event.ids) ids.add(id)
  }
  return ids
}

/**
 * Turns the agent's event stream into what the transcript renders: messages,
 * per-turn annotations, and which turns a retry has hidden.
 *
 * Owns deduplication and session scoping, because both have to happen before
 * anything else looks at an event. Knows nothing about transport or
 * persistence — the caller decides what to do with an event this accepts.
 */
export function useEventProjection({
  reducer,
  initialEvents,
}: {
  reducer: Reducer
  initialEvents: readonly ChatEvent[]
}) {
  // A chat's log can span several durable sessions, and eve restarts turn ids at
  // `turn_0` in each one. Scope them before anything reduces, or session 2's
  // first turn lands inside session 1's first turn.
  const seeded = useMemo(() => scopeSessions(initialEvents), [initialEvents])
  // Which session live events belong to; advanced when a `session.started`
  // arrives so streamed turns keep numbering on from the persisted log.
  const liveSessionRef = useRef(seeded.lastSession)
  const [data, setData] = useState<EveMessageData>(() =>
    // The supersede marker is display-only — keep it out of the eve reducer.
    reduceEvents(
      reducer,
      seeded.events.filter((e) => eventType(e) !== SUPERSEDE_EVENT)
    )
  )
  // Message ids hidden by a retry (the turn it replaced). Seeded from persisted
  // markers so a retried thread stays collapsed after reload.
  const [supersededIds, setSupersededIds] = useState<Set<string>>(() =>
    collectSuperseded(seeded.events)
  )
  // Lifecycle events the eve reducer drops (failures, cancellation, compaction,
  // finish reasons). Kept beside `data` so the transcript can explain itself.
  const [annotations, setAnnotations] = useState<TurnAnnotations>(() =>
    // Scoped too: annotations are keyed by turnId and looked up from the
    // rendered message's metadata, so both sides must agree on the id.
    annotateEvents(seeded.events.map(asEveEvent))
  )
  // Server event ids already projected for this chat, seeded from the full
  // stored log. A durable stream can hand back events we have already seen —
  // re-attaching after a reload replays them — and without this every replayed
  // `session.started` would advance the session scope again, splitting one turn
  // into several identical ones on screen and appending the whole session to
  // the log a second time.
  const seenIdsRef = useRef<Set<string>>(
    new Set(
      initialEvents
        .map((e) => eventId(e))
        .filter((id): id is string => id !== undefined)
    )
  )

  /**
   * Project one event, or report that it was a duplicate.
   *
   * Returns the scoped copy so the caller can persist eve's own event while the
   * scoping stays a render-time concern, and `null` when the log already held
   * it — which is the signal to skip every other per-event effect.
   */
  const project = useCallback(
    (event: ChatEvent) => {
      const id = eventId(event)
      if (id !== undefined) {
        if (seenIdsRef.current.has(id)) return null
        seenIdsRef.current.add(id)
      }
      // A new durable session restarts eve's turn numbering, so advance the
      // scope before projecting anything from it.
      if (isSessionStart(event)) liveSessionRef.current += 1
      const scoped = withSessionScope(event, liveSessionRef.current)
      const eve = asEveEvent(scoped)
      setData((prev) => prev && reducer.reduce(prev, eve))
      if (isAnnotatedEvent(eve))
        setAnnotations((prev) => annotateEvent(prev, eve))
      return eve
    },
    [reducer]
  )

  /** Optimistically hide a replaced turn. Pair with `resolveSupersede`. */
  const supersede = useCallback((ids: readonly string[]) => {
    setSupersededIds((prev) => new Set([...prev, ...ids]))
  }, [])

  /** Bring a turn back when the retry that replaced it never landed. */
  const unsupersede = useCallback((ids: readonly string[]) => {
    setSupersededIds((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.delete(id)
      return next
    })
  }, [])

  return {
    messages: data.messages,
    annotations,
    supersededIds,
    project,
    supersede,
    unsupersede,
  }
}
