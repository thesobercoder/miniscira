import type { ChatEvent } from "./chat-events"

// eve's defaultMessageReducer deliberately drops the lifecycle events that
// don't project into message parts — `turn.failed` and `session.failed` are a
// literal no-op in it, and `step.failed`, `step.completed`, `turn.cancelled`,
// and `compaction.*` never reach it at all. That means a failed turn renders as
// silence and a truncated answer looks like the model simply stopped.
//
// This keeps a parallel projection of exactly those events, keyed by turn, so
// the transcript can explain itself. It is deliberately additive: the reducer
// still owns everything that becomes a message part.

type TurnFailure = {
  code: string
  message: string
  /** Present when the failure came from a single step rather than the turn. */
  stepIndex?: number
}

type StepUsage = {
  inputTokens: number
  outputTokens: number
  costUsd: number
}

/** Why the model stopped, when that is worth explaining to the reader. */
type StopReason = "length" | "content-filter" | "error"

export type TurnAnnotation = {
  /** Terminal failure for the turn. */
  failure?: TurnFailure
  /** Non-fatal step failures the agent recovered from. */
  stepFailures: TurnFailure[]
  cancelled: boolean
  /** How many times context was compacted during this turn. */
  compactions: number
  /** Input tokens at the moment compaction was requested, when reported. */
  compactedAtTokens: number | null
  /** Only set for reasons a reader would otherwise find inexplicable. */
  stopReason?: StopReason
  usage: StepUsage
}

/**
 * `session.failed` carries only a sessionId — no turnId — so it lands here
 * rather than against a specific turn.
 */
export const SESSION_SCOPE = "__session__"

export type TurnAnnotations = Readonly<Record<string, TurnAnnotation>>

export const EMPTY_ANNOTATION: TurnAnnotation = {
  stepFailures: [],
  cancelled: false,
  compactions: 0,
  compactedAtTokens: null,
  usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
}

/** Reasons worth surfacing. `stop` and `tool-calls` are the normal path, and
 *  `other` tells the reader nothing actionable. */
const NOTABLE_STOP: ReadonlySet<string> = new Set([
  "length",
  "content-filter",
  "error",
])

type Data = Record<string, unknown>

const str = (v: unknown, fallback = "") =>
  typeof v === "string" ? v : fallback
const num = (v: unknown) => (typeof v === "number" ? v : 0)

function edit(
  prev: TurnAnnotations,
  turnId: string,
  patch: (current: TurnAnnotation) => TurnAnnotation
): TurnAnnotations {
  const current = prev[turnId] ?? EMPTY_ANNOTATION
  return { ...prev, [turnId]: patch(current) }
}

/**
 * Folds one stream event into the annotation map. Returns the same object when
 * the event carries nothing to annotate, so callers can skip re-rendering.
 */
export function annotateEvent(
  prev: TurnAnnotations,
  event: ChatEvent
): TurnAnnotations {
  const type = (event as { type?: string }).type
  const data = ((event as { data?: Data }).data ?? {}) as Data
  const turnId = str(data.turnId)

  switch (type) {
    case "turn.failed":
      return edit(prev, turnId, (c) => ({
        ...c,
        failure: {
          code: str(data.code, "unknown"),
          message: str(data.message),
        },
      }))

    case "session.failed":
      return edit(prev, SESSION_SCOPE, (c) => ({
        ...c,
        failure: {
          code: str(data.code, "unknown"),
          message: str(data.message),
        },
      }))

    case "step.failed":
      // Not terminal on its own — the agent often retries the step and carries
      // on, so this is recorded separately from `failure`.
      return edit(prev, turnId, (c) => ({
        ...c,
        stepFailures: [
          ...c.stepFailures,
          {
            code: str(data.code, "unknown"),
            message: str(data.message),
            stepIndex:
              typeof data.stepIndex === "number" ? data.stepIndex : undefined,
          },
        ],
      }))

    case "turn.cancelled":
      return edit(prev, turnId, (c) => ({ ...c, cancelled: true }))

    case "compaction.requested":
      return edit(prev, turnId, (c) => ({
        ...c,
        compactions: c.compactions + 1,
        compactedAtTokens:
          typeof data.usageInputTokens === "number"
            ? data.usageInputTokens
            : c.compactedAtTokens,
      }))

    case "step.completed": {
      const finishReason = str(data.finishReason)
      const usage = (data.usage ?? {}) as Data
      return edit(prev, turnId, (c) => ({
        ...c,
        // Steps accumulate across a turn, so usage sums rather than replaces.
        usage: {
          inputTokens: c.usage.inputTokens + num(usage.inputTokens),
          outputTokens: c.usage.outputTokens + num(usage.outputTokens),
          costUsd: c.usage.costUsd + num(usage.costUsd),
        },
        stopReason: NOTABLE_STOP.has(finishReason)
          ? (finishReason as StopReason)
          : c.stopReason,
      }))
    }

    default:
      return prev
  }
}

export function annotateEvents(
  events: readonly ChatEvent[],
  seed: TurnAnnotations = {}
): TurnAnnotations {
  let out = seed
  for (const e of events) out = annotateEvent(out, e)
  return out
}

/** True when the event changes the annotation map, i.e. is worth re-rendering. */
export function isAnnotatedEvent(event: ChatEvent): boolean {
  const type = (event as { type?: string }).type
  return (
    type === "turn.failed" ||
    type === "session.failed" ||
    type === "step.failed" ||
    type === "turn.cancelled" ||
    type === "compaction.requested" ||
    type === "step.completed"
  )
}
