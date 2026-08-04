import type {
  defaultMessageReducer,
  EveAgentReducerEvent,
  EveMessageData,
} from "eve/client"
import { type ChatEvent, eventType, subagentCallId } from "./chat-events"

// Subagents surface their work two different ways, and which one applies
// depends on how the subagent runs.
//
// 1. INLINE subagents have every child event forwarded into the parent stream
//    wrapped as `subagent.event`. `defaultMessageReducer` ignores the wrapper,
//    so `subagentChild` unwraps it.
//
// 2. Subagents that run as their own durable workflow run do NOT forward
//    anything — this project's `researcher` is one of these, and a real turn
//    emits only `subagent.called` / `subagent.completed`, never
//    `subagent.event`. Their events live in a separate session identified by
//    `childSessionId` (a `wrun_…` id), which the client has to attach to.
//
// Both paths key on the parent's `callId`, which lines up with the tool part by
// construction: a subagent call is an action request carrying `callId`, and the
// reducer builds its part with `toolCallId: action.callId`.

/** A delegated child session discovered from a `subagent.called` event. */
export type SubagentCall = {
  callId: string
  childSessionId: string
  name: string
}

/** Collects the child sessions a turn delegated to, for stream attachment. */
export function collectSubagentCalls(
  events: readonly ChatEvent[]
): SubagentCall[] {
  const out: SubagentCall[] = []
  const seen = new Set<string>()
  for (const e of events) {
    if (eventType(e) !== "subagent.called") continue
    const d = (e as { data?: Record<string, unknown> }).data ?? {}
    const callId = subagentCallId(e)
    const childSessionId =
      typeof d.childSessionId === "string" ? d.childSessionId : undefined
    if (!callId || !childSessionId || seen.has(callId)) continue
    seen.add(callId)
    out.push({
      callId,
      childSessionId,
      name: typeof d.subagentName === "string" ? d.subagentName : "subagent",
    })
  }
  return out
}

export const EMPTY_MESSAGE_DATA: EveMessageData = { messages: [] }

/** Unwraps a `subagent.event` into the child event and the parent call it
 *  belongs to. Returns null for every other event type. */
export function subagentChild(
  event: ChatEvent
): { callId: string; event: EveAgentReducerEvent } | null {
  if (eventType(event) !== "subagent.event") return null
  const data = (event as { data?: { callId?: unknown; event?: unknown } }).data
  if (typeof data?.callId !== "string" || !data.event) return null
  return { callId: data.callId, event: data.event as EveAgentReducerEvent }
}

/** Reduces every wrapped child event into a per-call projection, so a reload
 *  replays the same nested detail a live stream showed. */
export function reduceSubagentEvents(
  reducer: ReturnType<typeof defaultMessageReducer>,
  events: readonly ChatEvent[]
): Record<string, EveMessageData> {
  const out: Record<string, EveMessageData> = {}
  for (const e of events) {
    const child = subagentChild(e)
    if (!child) continue
    out[child.callId] = reducer.reduce(
      out[child.callId] ?? EMPTY_MESSAGE_DATA,
      child.event
    )
  }
  return out
}
