import {
  type ClientInputRespondedEvent,
  type ClientMessageFailedEvent,
  type ClientMessageSubmittedEvent,
  type EveAgentReducerEvent,
  type EveMessagePart,
  type InputResponse,
  isCurrentTurnBoundaryEvent,
} from "eve/client"

/**
 * A chat's persisted log is what eve's reducer accepts plus one projection event
 * of our own. Stating that contract once here is what lets call sites narrow on
 * it instead of asserting a shape per read.
 *
 * eve 0.28 made its own client-side projection events public
 * (`EveAgentReducerEvent` covers `client.input.responded`, `client.message.*`
 * and every server event), so only the supersede marker below is still ours.
 */

/** Marks the question+answer pair a retry or edit replaced, so the collapse survives reload. */
export const SUPERSEDE_EVENT = "client.superseded"
/** eve's own client projection event for a submitted HITL answer. */
export const INPUT_RESPONDED_EVENT = "client.input.responded"

export type { InputResponse }

export type SupersedeEvent = {
  type: typeof SUPERSEDE_EVENT
  ids: readonly string[]
  operationId?: string
}

/**
 * Every projection event that exists only in the browser: eve's own three plus
 * our supersede marker. Anything else in `ChatEvent` came from the server.
 */
export type ClientEvent =
  | SupersedeEvent
  | ClientInputRespondedEvent
  | ClientMessageFailedEvent
  | ClientMessageSubmittedEvent

/** Everything that can appear in a chat's persisted event log. */
export type ChatEvent = EveAgentReducerEvent | SupersedeEvent

/**
 * eve's event payloads aren't exposed as one discriminated union we can narrow
 * on, so this is the single place allowed to read `.type` off an opaque event.
 */
export function eventType(event: ChatEvent): string {
  return (event as { type?: string }).type ?? ""
}

/** Client projection events never leave the browser's log — the server's stream
 *  index counts only its own events, so resume math has to skip these. */
export function isClientEvent(event: ChatEvent): event is ClientEvent {
  return eventType(event).startsWith("client.")
}

/**
 * The server's stable id for one stream event (`meta.id`, an ULID).
 *
 * Every server event carries one and it survives a durable-stream replay, which
 * is what makes it usable as an identity for de-duplication. Client projection
 * events have no `meta`, so they return undefined and are never deduped — they
 * are generated locally and each one is genuinely new.
 */
export function eventId(event: ChatEvent): string | undefined {
  const id = (event as { meta?: { id?: unknown } }).meta?.id
  return typeof id === "string" ? id : undefined
}

export function isSupersedeEvent(event: ChatEvent): event is SupersedeEvent {
  return eventType(event) === SUPERSEDE_EVENT
}

/**
 * Narrows a persisted event to something eve's reducer accepts. Only the
 * supersede marker is ours, and it is filtered out before reduction, so this is
 * a cast the union can't express rather than a claim about an unknown shape.
 */
export function asEveEvent(event: ChatEvent): EveAgentReducerEvent {
  return event as EveAgentReducerEvent
}

/**
 * True when an event settles the current turn.
 *
 * eve's own predicate takes server events only, and since 0.28 the compiler
 * enforces that — a client projection event can never be a turn boundary, so
 * those short-circuit to false instead of being cast into the check.
 */
export function isTurnBoundary(event: ChatEvent): boolean {
  return isClientEvent(event) ? false : isCurrentTurnBoundaryEvent(event)
}

/** True when an event opens a new durable session. */
export function isSessionStart(event: ChatEvent): boolean {
  return eventType(event) === "session.started"
}

/**
 * Scopes an event's `turnId` to the session it belongs to.
 *
 * eve numbers turns within a session (`turn_0`, `turn_1`, …) and restarts at
 * `turn_0` for every new one, while the reducer derives message identity
 * straight from it (`${turnId}:assistant`). One chat's persisted log can span
 * several sessions — a branch, an expired session, a reset cursor — so without
 * this the second session's first answer is merged into the first session's
 * first answer, in the same bubble.
 *
 * Session 0 is left untouched so single-session chats keep the exact ids they
 * already have: supersede markers persisted before this existed still match.
 *
 * Render-time only. The event we persist keeps eve's original id.
 */
export function withSessionScope<T extends ChatEvent>(
  event: T,
  session: number
): T {
  if (session <= 0) return event
  const data = (event as { data?: { turnId?: unknown } }).data
  if (!data || typeof data.turnId !== "string") return event
  return {
    ...event,
    data: { ...data, turnId: `s${session}:${data.turnId}` },
  } as T
}

/**
 * Scopes a whole persisted log and reports how many sessions it spans, so the
 * caller can keep numbering live events from where the log left off.
 */
export function scopeSessions(events: readonly ChatEvent[]): {
  events: ChatEvent[]
  lastSession: number
} {
  let session = -1
  const out: ChatEvent[] = []
  for (const event of events) {
    if (isSessionStart(event)) session += 1
    out.push(withSessionScope(event, session))
  }
  return { events: out, lastSession: session }
}

/** Concatenated text of a message's parts of one type. */
export function partText(
  parts: readonly EveMessagePart[],
  type: "text" | "reasoning"
) {
  return parts
    .filter((p) => p.type === type)
    .map((p) => (p as { text: string }).text)
    .join("")
}

/** `data.callId` off a subagent lifecycle event, or undefined when absent. */
export function subagentCallId(event: ChatEvent): string | undefined {
  const callId = (event as { data?: { callId?: unknown } }).data?.callId
  return typeof callId === "string" ? callId : undefined
}
