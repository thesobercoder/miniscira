import { describe, expect, test } from "bun:test"

import {
  foldCompactionChunks,
  runCheckpointSingleFlight,
} from "@/lib/conversation-compaction"

describe("foldCompactionChunks", () => {
  test("appends one immutable checkpoint segment per source chunk", async () => {
    const calls: Array<{ transcriptChunk: string }> = []
    const summary = await foldCompactionChunks({
      priorSummary: "old",
      chunks: ["first", "middle", "last"],
      summarize: async (input) => {
        calls.push(input)
        return `summary-${calls.length}`
      },
    })

    expect(summary).toBe(
      "old\n\nsummary-1\n\nsummary-2\n\nsummary-3"
    )
    expect(calls).toEqual([
      { transcriptChunk: "first" },
      { transcriptChunk: "middle" },
      { transcriptChunk: "last" },
    ])
  })
})

describe("runCheckpointSingleFlight", () => {
  test("shares one in-flight generation for the same digest", async () => {
    let calls = 0
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const work = async () => {
      calls += 1
      await gate
      return null
    }
    const first = runCheckpointSingleFlight("chat:digest", work)
    const second = runCheckpointSingleFlight("chat:digest", work)
    expect(first).toBe(second)
    expect(calls).toBe(1)
    release?.()
    await Promise.all([first, second])
  })
})
