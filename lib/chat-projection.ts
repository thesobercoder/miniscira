import type { defaultMessageReducer, EveMessageData } from "eve/client"

import {
  asEveEvent,
  type ChatEvent,
  eventType,
  isSupersedeEvent,
  SUPERSEDE_EVENT,
  scopeSessions,
} from "@/lib/chat-events"
import { annotateEvents, type TurnAnnotations } from "@/lib/turn-annotations"

type Reducer = ReturnType<typeof defaultMessageReducer>

export interface PersistedChatProjection {
  data: EveMessageData
  annotations: TurnAnnotations
  supersededIds: Set<string>
  lastSession: number
}

export function projectPersistedChat(
  reducer: Reducer,
  events: readonly ChatEvent[]
): PersistedChatProjection {
  const scoped = scopeSessions(events)
  let data = reducer.initial()
  for (const event of scoped.events) {
    if (eventType(event) === SUPERSEDE_EVENT) continue
    data = reducer.reduce(data, asEveEvent(event))
  }

  const supersededIds = new Set<string>()
  for (const event of scoped.events) {
    if (!isSupersedeEvent(event)) continue
    for (const id of event.ids) supersededIds.add(id)
  }

  return {
    data,
    annotations: annotateEvents(scoped.events.map(asEveEvent)),
    supersededIds,
    lastSession: scoped.lastSession,
  }
}

export function visibleMessages(
  projection: PersistedChatProjection
): EveMessageData["messages"] {
  return projection.data.messages.filter(
    (message) => !projection.supersededIds.has(message.id)
  )
}
