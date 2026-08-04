import {
  defaultMessageReducer,
  type EveAgentReducerEvent,
  type EveMessage,
  type EveMessageData,
  type EveMessagePart,
} from "eve/client"

/**
 * eve's reducer keeps exactly one reasoning part per agent step. `upsertRun`
 * scans back for the last reasoning part with the same `stepIndex` and, while
 * that part is still `streaming`, overwrites it in place with `reasoningSoFar`
 * — the step's cumulative thinking. `reasoning.completed` only fires when the
 * step ends, so a step that thinks, searches, then thinks again folds both
 * thoughts into the part that sits *before* the searches.
 *
 * That reads wrong in a research timeline: the whole turn's thinking piles into
 * the first node and the searches render after it, as if nothing was reasoned
 * about the results. This wrapper splits a step's reasoning into one part per
 * uninterrupted run by sealing the open run whenever a tool call has landed
 * since, then handing the base reducer only the text that run hasn't shown yet.
 *
 * Everything else passes straight through, so this stays a thin correction to
 * eve's projection rather than a fork of it.
 */
export function segmentedMessageReducer() {
  const base = defaultMessageReducer()

  return {
    initial: () => base.initial(),
    reduce(data: EveMessageData, event: EveAgentReducerEvent): EveMessageData {
      const kind = (event as { type?: string }).type
      if (kind !== "reasoning.appended" && kind !== "reasoning.completed")
        return base.reduce(data, event)

      const { turnId, stepIndex = 0 } = (
        event as { data: { turnId: string; stepIndex?: number } }
      ).data
      const sealed = sealInterruptedRun(data, turnId, stepIndex)
      const shown = shownLength(sealed, turnId, stepIndex)
      if (shown === 0) return base.reduce(sealed, event)

      // `reasoning.completed` closes the step *after* its tool calls, restating
      // text the sealed runs already show. Passing that through would open a run
      // with nothing left in it and render an empty node. Nothing is left open
      // at this point either — the text is only fully accounted for once every
      // run is sealed — so dropping the event loses no state.
      if (textOf(event).length <= shown) return sealed
      return base.reduce(sealed, trim(event, shown))
    },
  }
}

type ReasoningPart = Extract<EveMessagePart, { type: "reasoning" }>

function isReasoningOfStep(
  part: EveMessagePart,
  stepIndex: number
): part is ReasoningPart {
  return part.type === "reasoning" && (part.stepIndex ?? 0) === stepIndex
}

function assistantIndex(data: EveMessageData, turnId: string) {
  return data.messages.findIndex(
    (m) => m.role === "assistant" && m.metadata?.turnId === turnId
  )
}

/**
 * Marks the step's open reasoning run `done` once something else — a tool call,
 * an authorization prompt — has been appended after it. A `done` run makes
 * eve's `upsertRun` append a fresh part instead of overwriting this one, which
 * is what puts the next thought after the tool nodes rather than before them.
 */
function sealInterruptedRun(
  data: EveMessageData,
  turnId: string,
  stepIndex: number
): EveMessageData {
  const index = assistantIndex(data, turnId)
  if (index === -1) return data
  const message = data.messages[index]

  const open = message.parts.findIndex(
    (p) => isReasoningOfStep(p, stepIndex) && p.state === "streaming"
  )
  // Nothing open, or nothing has landed after it — leave the run alone so
  // ordinary delta-by-delta streaming keeps updating a single part.
  if (open === -1 || open === message.parts.length - 1) return data

  const parts: EveMessagePart[] = message.parts.map((p, i) =>
    i === open && p.type === "reasoning" ? { ...p, state: "done" } : p
  )
  const messages = [...data.messages]
  messages[index] = { ...message, parts } as EveMessage
  return { ...data, messages }
}

/** How much of this step's reasoning earlier, sealed runs already display. */
function shownLength(data: EveMessageData, turnId: string, stepIndex: number) {
  const index = assistantIndex(data, turnId)
  if (index === -1) return 0
  let total = 0
  for (const part of data.messages[index].parts)
    if (isReasoningOfStep(part, stepIndex) && part.state === "done")
      total += part.text.length
  return total
}

type ReasoningEvent = {
  type: string
  data: { reasoning?: string; reasoningSoFar?: string }
}

/**
 * The step's cumulative thinking. `reasoning.appended` streams it as
 * `reasoningSoFar`; `reasoning.completed` restates it as `reasoning`.
 */
function textOf(event: EveAgentReducerEvent): string {
  const e = event as ReasoningEvent
  const text =
    e.type === "reasoning.completed" ? e.data.reasoning : e.data.reasoningSoFar
  return typeof text === "string" ? text : ""
}

/**
 * Drops the prefix earlier runs already show, so each part holds only its own
 * thought instead of repeating the step from the beginning.
 */
function trim(
  event: EveAgentReducerEvent,
  shown: number
): EveAgentReducerEvent {
  const e = event as ReasoningEvent
  const field =
    e.type === "reasoning.completed" ? "reasoning" : "reasoningSoFar"
  if (typeof e.data[field] !== "string") return event
  return {
    ...e,
    data: { ...e.data, [field]: e.data[field].slice(shown) },
  } as EveAgentReducerEvent
}
