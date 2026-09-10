import { describe, expect, test } from "bun:test"

import {
  adapterFor,
  isUserOverridable,
  WORKLOADS,
  type WorkloadId,
} from "@/lib/workload-registry"
import type { ModelCapabilities } from "@/lib/provider-policy"

function caps(overrides?: Partial<ModelCapabilities>): ModelCapabilities {
  return {
    input: new Set(["text", "image"]),
    output: new Set(["text"]),
    streaming: true,
    tools: true,
    structuredOutput: true,
    imageGeneration: false,
    imageEditing: false,
    videoGeneration: false,
    contextWindowTokens: 128000,
    ...overrides,
  }
}

const ALL_IDS: WorkloadId[] = [
  "chat",
  "research_root",
  "researcher",
  "lookout",
  "image_generation",
  "image_editing",
  "video_generation",
  "title",
  "summary",
  "compaction",
  "memory",
  "evaluation",
]

describe("WORKLOADS table", () => {
  test("covers all twelve workloads", () => {
    expect(Object.keys(WORKLOADS).sort()).toEqual([...ALL_IDS].sort())
  })

  test("allows fallback only for chat and lookout", () => {
    for (const id of ALL_IDS) {
      const want = id === "chat" || id === "lookout"
      expect(WORKLOADS[id].fallbackAllowed).toBe(want)
    }
  })

  test("maps video to the video adapter and images to image", () => {
    expect(adapterFor("video_generation")).toBe("video")
    expect(adapterFor("image_generation")).toBe("image")
    expect(adapterFor("image_editing")).toBe("image")
    expect(adapterFor("chat")).toBe("chat")
    expect(adapterFor("compaction")).toBe("chat")
  })

  test("keeps internal workloads out of user override", () => {
    for (const id of [
      "title",
      "summary",
      "compaction",
      "memory",
      "evaluation",
    ] as WorkloadId[]) {
      expect(isUserOverridable(id)).toBe(false)
      expect(WORKLOADS[id].overrideScopes).toEqual([])
    }
  })

  test("lets users override chat, research, lookout, image, video", () => {
    for (const id of [
      "chat",
      "research_root",
      "researcher",
      "lookout",
      "image_generation",
      "image_editing",
      "video_generation",
    ] as WorkloadId[]) {
      expect(isUserOverridable(id)).toBe(true)
      expect(WORKLOADS[id].overrideScopes).toContain("saved_default")
      expect(WORKLOADS[id].overrideScopes).toContain("per_action")
    }
  })
})

describe("requires() predicates", () => {
  test("chat needs image input and streaming", () => {
    expect(WORKLOADS.chat.requires(caps())).toEqual([])
    expect(
      WORKLOADS.chat.requires(
        caps({ input: new Set(["text"]), streaming: false })
      )
    ).toEqual(["input:image", "streaming"])
  })

  test("research root needs text, streaming, and tools, but no image input", () => {
    expect(
      WORKLOADS.research_root.requires(caps({ input: new Set(["text"]) }))
    ).toEqual([])
    expect(WORKLOADS.research_root.requires(caps({ tools: false }))).toEqual([
      "tools",
    ])
    expect(
      WORKLOADS.research_root.requires(caps({ streaming: false }))
    ).toEqual(["streaming"])
  })

  test("researcher and lookout need text plus tools only", () => {
    const textOnly = caps({ input: new Set(["text"]), streaming: false })
    expect(WORKLOADS.researcher.requires(textOnly)).toEqual([])
    expect(WORKLOADS.lookout.requires(textOnly)).toEqual([])
    expect(
      WORKLOADS.researcher.requires(
        caps({ input: new Set(["text"]), streaming: false, tools: false })
      )
    ).toEqual(["tools"])
    expect(
      WORKLOADS.lookout.requires(
        caps({ input: new Set(["text"]), streaming: false, tools: false })
      )
    ).toEqual(["tools"])
  })

  test("title and memory need structured output", () => {
    expect(WORKLOADS.title.requires(caps())).toEqual([])
    expect(WORKLOADS.title.requires(caps({ structuredOutput: false }))).toEqual(
      ["structured-output"]
    )
    expect(
      WORKLOADS.memory.requires(caps({ structuredOutput: false }))
    ).toEqual(["structured-output"])
  })

  test("compaction and summary need a known context window", () => {
    expect(WORKLOADS.compaction.requires(caps())).toEqual([])
    expect(
      WORKLOADS.compaction.requires(caps({ contextWindowTokens: null }))
    ).toEqual(["known-context-window"])
    expect(
      WORKLOADS.summary.requires(caps({ contextWindowTokens: null }))
    ).toEqual(["known-context-window"])
  })

  test("image and video need the matching flag plus modality", () => {
    const image = caps({
      output: new Set(["image"]),
      imageGeneration: true,
    })
    expect(WORKLOADS.image_generation.requires(image)).toEqual([])
    expect(WORKLOADS.image_generation.requires(caps())).toEqual([
      "image-generation",
      "output:image",
    ])
    expect(WORKLOADS.video_generation.requires(caps())).toEqual([
      "video-generation",
      "output:video",
    ])
    expect(
      WORKLOADS.image_generation.requires(
        caps({ input: new Set(["image"]), output: new Set(["image"]) })
      )
    ).toEqual(["input:text", "image-generation"])
    expect(
      WORKLOADS.video_generation.requires(
        caps({
          input: new Set(["image"]),
          output: new Set(["video"]),
          videoGeneration: true,
        })
      )
    ).toEqual(["input:text"])
  })
})
