import { describe, expect, test } from "bun:test"
import type { EveMessagePart } from "eve/client"

import {
  errorOf,
  groupParts,
  isPartDone,
  type TimelinePart,
} from "@/components/timeline/parts"

function reasoning(text: string, stepIndex = 0): EveMessagePart {
  return { type: "reasoning", text, state: "done", stepIndex }
}

function tool(
  toolName: string,
  stepIndex = 0,
  input: Record<string, unknown> = {}
): EveMessagePart {
  return {
    type: "dynamic-tool",
    toolCallId: `${toolName}-${stepIndex}`,
    toolName,
    state: "output-available",
    input,
    output: {},
    stepIndex,
  }
}

const kinds = (parts: EveMessagePart[]) => groupParts(parts).map((g) => g.kind)

describe("groupParts", () => {
  test("merges reasoning deltas that are adjacent within one step", () => {
    const groups = groupParts([reasoning("half a "), reasoning("thought")])

    expect(groups).toHaveLength(1)
    expect(groups[0].parts).toHaveLength(2)
  })

  test("does not merge reasoning across a text part", () => {
    // `text` parts are skipped by groupParts and leave no group behind, so
    // without an adjacency check the second thought lands in the first node.
    const parts = [
      reasoning("first thought"),
      { type: "text", text: "an answer", state: "done" } as EveMessagePart,
      reasoning("second thought"),
    ]

    expect(kinds(parts)).toEqual(["reasoning", "reasoning"])
  })

  test("does not merge reasoning across a step boundary", () => {
    const parts = [
      reasoning("step zero", 0),
      { type: "step-start" } as EveMessagePart,
      reasoning("step one", 1),
    ]

    expect(kinds(parts)).toEqual(["reasoning", "reasoning"])
  })

  test("does not merge reasoning across a skill load", () => {
    const parts = [
      reasoning("pick a playbook"),
      tool("load_skill", 0, { skill: "news_brief" }),
      reasoning("now search"),
    ]

    expect(kinds(parts)).toEqual(["reasoning", "skill", "reasoning"])
  })

  test("renders skill loads as their own node", () => {
    const groups = groupParts([tool("load_skill", 0, { skill: "news_brief" })])

    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe("skill")
  })

  test("still merges consecutive searches into one section", () => {
    const parts = [tool("web_search", 0), tool("exa_search", 0)]
    const groups = groupParts(parts)

    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe("search")
    expect(groups[0].parts).toHaveLength(2)
  })
})

describe("terminal tool states", () => {
  const withState = (state: string, extra: Record<string, unknown> = {}) =>
    ({
      type: "dynamic-tool",
      toolCallId: "c1",
      toolName: "web_search",
      state,
      input: {},
      ...extra,
    }) as unknown as TimelinePart

  test("a declined call is done, not perpetually live", () => {
    // Regression: `output-denied` was missing from isPartDone, so a declined
    // step kept its spinner forever.
    expect(isPartDone(withState("output-denied"))).toBe(true)
  })

  test("errored and available calls are done; pending ones are not", () => {
    expect(isPartDone(withState("output-error"))).toBe(true)
    expect(isPartDone(withState("output-available"))).toBe(true)
    expect(isPartDone(withState("input-available"))).toBe(false)
    expect(isPartDone(withState("approval-requested"))).toBe(false)
  })

  test("surfaces the failure reason", () => {
    expect(
      errorOf(withState("output-error", { errorText: "429 rate limit" }))
    ).toBe("429 rate limit")
  })

  test("falls back to a sentence when the failure carries no text", () => {
    expect(errorOf(withState("output-error"))).toBe("This step failed.")
    expect(errorOf(withState("output-denied"))).toBe("You declined this step.")
  })

  test("a successful call has no error", () => {
    expect(
      errorOf(withState("output-available", { output: {} }))
    ).toBeUndefined()
    expect(errorOf(reasoning("thinking") as TimelinePart)).toBeUndefined()
  })
})
