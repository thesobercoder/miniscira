import { describe, expect, test } from "bun:test"
import type { EveAgentReducerEvent } from "eve/client"
import { defaultMessageReducer, type EveMessageData } from "eve/client"
import { segmentedMessageReducer } from "@/lib/message-reducer"

const TURN = "turn_0"

const event = (type: string, data: Record<string, unknown>) =>
  ({ type, data: { turnId: TURN, ...data } }) as unknown as EveAgentReducerEvent

/**
 * The shape the DB shows for a real research turn: one step that reasons, runs
 * a search, then reasons again — all under stepIndex 0, with `reasoningSoFar`
 * carrying the step's cumulative text.
 */
const TIMELINE: EveAgentReducerEvent[] = [
  event("step.started", { stepIndex: 0, sequence: 0 }),
  event("reasoning.appended", {
    stepIndex: 0,
    reasoningDelta: "First I ",
    reasoningSoFar: "First I ",
  }),
  event("reasoning.appended", {
    stepIndex: 0,
    reasoningDelta: "should search.",
    reasoningSoFar: "First I should search.",
  }),
  event("actions.requested", {
    stepIndex: 0,
    actions: [
      { kind: "tool-call", callId: "c1", toolName: "web_search", input: {} },
    ],
  }),
  event("action.result", {
    stepIndex: 0,
    status: "ok",
    result: { kind: "tool-result", callId: "c1", output: { results: [] } },
  }),
  event("reasoning.appended", {
    stepIndex: 0,
    reasoningDelta: "Now I have data.",
    reasoningSoFar: "First I should search.Now I have data.",
  }),
  event("reasoning.completed", {
    stepIndex: 0,
    reasoning: "First I should search.Now I have data.",
  }),
]

function run(reducer: {
  initial(): EveMessageData
  reduce(d: EveMessageData, e: EveAgentReducerEvent): EveMessageData
}) {
  let data = reducer.initial()
  for (const e of TIMELINE) data = reducer.reduce(data, e)
  return data.messages.find((m) => m.role === "assistant")?.parts ?? []
}

describe("segmentedMessageReducer", () => {
  test("eve's default folds the whole step into one part before the search", () => {
    // Guards the premise: if eve changes this, the wrapper can go.
    const parts = run(defaultMessageReducer())
    const reasoning = parts.filter((p) => p.type === "reasoning")

    expect(reasoning).toHaveLength(1)
    expect(reasoning[0].text).toBe("First I should search.Now I have data.")
    expect(parts.findIndex((p) => p.type === "reasoning")).toBeLessThan(
      parts.findIndex((p) => p.type === "dynamic-tool")
    )
  })

  test("splits a step's reasoning at the tool call", () => {
    const parts = run(segmentedMessageReducer())
    const reasoning = parts.filter((p) => p.type === "reasoning")

    expect(reasoning).toHaveLength(2)
    expect(reasoning[0].text).toBe("First I should search.")
    expect(reasoning[1].text).toBe("Now I have data.")
  })

  test("orders the second thought after the tool call", () => {
    const parts = run(segmentedMessageReducer())
    const tool = parts.findIndex((p) => p.type === "dynamic-tool")
    const second = parts.map((p) => p.type).lastIndexOf("reasoning")

    expect(second).toBeGreaterThan(tool)
  })

  test("leaves uninterrupted reasoning as a single part", () => {
    const reducer = segmentedMessageReducer()
    let data = reducer.initial()
    for (const e of [
      event("step.started", { stepIndex: 0, sequence: 0 }),
      event("reasoning.appended", {
        stepIndex: 0,
        reasoningDelta: "one ",
        reasoningSoFar: "one ",
      }),
      event("reasoning.appended", {
        stepIndex: 0,
        reasoningDelta: "thought",
        reasoningSoFar: "one thought",
      }),
      event("reasoning.completed", { stepIndex: 0, reasoning: "one thought" }),
    ])
      data = reducer.reduce(data, e)

    const parts = data.messages.find((m) => m.role === "assistant")?.parts ?? []
    const reasoning = parts.filter((p) => p.type === "reasoning")
    expect(reasoning).toHaveLength(1)
    expect(reasoning[0].text).toBe("one thought")
  })

  test("does not open an empty run when the step closes after its tools", () => {
    // `reasoning.completed` fires at the end of the step, i.e. after the last
    // tool call, restating text the sealed runs already show. Replaying a real
    // turn from the DB produced a 0-character part here before this was handled.
    const reducer = segmentedMessageReducer()
    let data = reducer.initial()
    for (const e of [
      ...TIMELINE,
      event("actions.requested", {
        stepIndex: 0,
        actions: [
          { kind: "tool-call", callId: "c2", toolName: "web_fetch", input: {} },
        ],
      }),
      event("action.result", {
        stepIndex: 0,
        status: "ok",
        result: { kind: "tool-result", callId: "c2", output: {} },
      }),
      event("reasoning.completed", {
        stepIndex: 0,
        reasoning: "First I should search.Now I have data.",
      }),
    ])
      data = reducer.reduce(data, e)

    const parts = data.messages.find((m) => m.role === "assistant")?.parts ?? []
    const reasoning = parts.filter((p) => p.type === "reasoning")

    expect(reasoning.map((p) => p.text)).toEqual([
      "First I should search.",
      "Now I have data.",
    ])
    expect(reasoning.every((p) => p.text.length > 0)).toBe(true)
  })

  test("keeps steps separate and passes other events through", () => {
    const reducer = segmentedMessageReducer()
    let data = reducer.initial()
    for (const e of [
      ...TIMELINE,
      event("step.started", { stepIndex: 1, sequence: 0 }),
      event("reasoning.appended", {
        stepIndex: 1,
        reasoningDelta: "Second step.",
        reasoningSoFar: "Second step.",
      }),
      event("reasoning.completed", { stepIndex: 1, reasoning: "Second step." }),
    ])
      data = reducer.reduce(data, e)

    const parts = data.messages.find((m) => m.role === "assistant")?.parts ?? []
    const texts = parts
      .filter((p) => p.type === "reasoning")
      .map((p) => (p as { text: string }).text)

    expect(texts).toEqual([
      "First I should search.",
      "Now I have data.",
      "Second step.",
    ])
    expect(parts.some((p) => p.type === "dynamic-tool")).toBe(true)
  })
})
