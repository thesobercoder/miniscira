"use client"

import type { defaultMessageReducer, EveMessageData } from "eve/client"
import { useCallback, useMemo, useRef, useState } from "react"

import {
  asEveEvent,
  type ChatEvent,
  eventId,
  isSessionStart,
  withSessionScope,
} from "@/lib/chat-events"
import { projectPersistedChat } from "@/lib/chat-projection"
import {
  annotateEvent,
  isAnnotatedEvent,
  type TurnAnnotations,
} from "@/lib/turn-annotations"

type Reducer = ReturnType<typeof defaultMessageReducer>

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
  const seeded = useMemo(
    () => projectPersistedChat(reducer, initialEvents),
    [reducer, initialEvents]
  )
  const liveSessionRef = useRef(seeded.lastSession)
  const [data, setData] = useState<EveMessageData>(() => seeded.data)
  const [supersededIds, setSupersededIds] = useState<Set<string>>(
    () => seeded.supersededIds
  )
  const [annotations, setAnnotations] = useState<TurnAnnotations>(
    () => seeded.annotations
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
