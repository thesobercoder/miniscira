import { describe, expect, test } from "bun:test"
import type { EveMessage, EveMessagePart } from "eve/client"

import { modelFileParts, selectChildParts } from "@/components/research-chat"

function toolCall(toolCallId: string): EveMessagePart {
  return {
    type: "dynamic-tool",
    toolCallId,
    toolName: "delegate",
    state: "output-available",
    input: {},
    output: {},
  }
}

const text: EveMessagePart = { type: "text", text: "done", state: "done" }

function message(id: string, parts: readonly EveMessagePart[]): EveMessage {
  return { id, role: "assistant", parts }
}

const partsOf = (callId: string): readonly EveMessagePart[] => [
  { type: "reasoning", text: `thinking in ${callId}`, state: "done" },
]

describe("selectChildParts", () => {
  test("keeps only the call ids that appear in the message", () => {
    const childParts = { a: partsOf("a"), b: partsOf("b"), c: partsOf("c") }
    const subset = selectChildParts(
      message("m1", [toolCall("a"), text, toolCall("b")]),
      childParts
    )

    expect(Object.keys(subset).sort()).toEqual(["a", "b"])
    expect(subset.a).toBe(childParts.a)
    expect(subset.b).toBe(childParts.b)
  })

  test("returns the same empty object for a message with no tool calls", () => {
    const childParts = { a: partsOf("a") }
    const first = selectChildParts(message("m2", [text]), childParts)
    const second = selectChildParts(message("m3", [text]), childParts)

    expect(first).toEqual({})
    // Not a fresh `{}` each call — a new reference would defeat the memo on
    // every turn that never used a subagent, which is most of them.
    expect(first).toBe(second)
  })

  test("returns the same empty object when no call id matches", () => {
    const empty = selectChildParts(message("m4", [text]), undefined)
    const unmatched = selectChildParts(message("m5", [toolCall("z")]), {
      a: partsOf("a"),
    })

    expect(unmatched).toEqual({})
    expect(unmatched).toBe(empty)
  })

  test("returns the identical reference when the inputs are unchanged", () => {
    const m = message("m6", [toolCall("a")])
    const childParts = { a: partsOf("a"), b: partsOf("b") }

    const first = selectChildParts(m, childParts)
    const second = selectChildParts(m, childParts)

    expect(second).toBe(first)
  })

  test("keeps its identity when an unrelated subagent updates", () => {
    const m = message("m7", [toolCall("a")])
    const a = partsOf("a")
    const first = selectChildParts(m, { a, b: partsOf("b") })
    // A new whole-conversation object (rebuilt ~8x/second while `b` streams)
    // whose `a` entry is untouched must not hand this turn a new subset.
    const second = selectChildParts(m, { a, b: partsOf("b-updated") })

    expect(second).toBe(first)
  })

  test("returns a new reference when the message's own entry changes", () => {
    const m = message("m8", [toolCall("a")])
    const first = selectChildParts(m, { a: partsOf("a") })
    const second = selectChildParts(m, { a: partsOf("a-updated") })

    expect(second).not.toBe(first)
    expect(Object.keys(second)).toEqual(["a"])
  })
})

describe("modelFileParts", () => {
  test("inlines an image as a model-safe data URL", async () => {
    const originalFetch = globalThis.fetch
    const originalFileReader = globalThis.FileReader
    globalThis.fetch = (async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/png" },
      })) as unknown as typeof fetch
    globalThis.FileReader = class {
      result: string | ArrayBuffer | null = null
      onload: null | (() => void) = null
      onerror: null | (() => void) = null
      readAsDataURL() {
        this.result = "data:image/png;base64,AQID"
        this.onload?.()
      }
    } as unknown as typeof FileReader

    try {
      const [part] = await modelFileParts([
        {
          id: "image-1",
          filename: "image.png",
          status: "ready",
          kind: "image",
          mimeType: "image/png",
          url: "/api/files/image.png",
        },
      ])
      expect(part.type).toBe("file")
      expect(part.mediaType).toBe("image/png")
      expect(part.data.href).toBe("data:image/png;base64,AQID")
    } finally {
      globalThis.fetch = originalFetch
      globalThis.FileReader = originalFileReader
    }
  })

  test("preserves a supplied document MIME type in the model part builder", async () => {
    const originalFetch = globalThis.fetch
    const originalFileReader = globalThis.FileReader
    const mimeType =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    globalThis.fetch = (async () =>
      new Response(new Uint8Array([80, 75]), {
        headers: { "content-type": "application/octet-stream" },
      })) as unknown as typeof fetch
    globalThis.FileReader = class {
      result: string | ArrayBuffer | null = null
      onload: null | (() => void) = null
      onerror: null | (() => void) = null
      readAsDataURL() {
        this.result = "data:application/octet-stream;base64,UEs="
        this.onload?.()
      }
    } as unknown as typeof FileReader

    try {
      const [part] = await modelFileParts([
        {
          id: "docx-1",
          filename: "brief.docx",
          status: "ready",
          kind: "document",
          mimeType,
          url: "/api/files/brief.docx",
        },
      ])
      expect(part.mediaType).toBe(mimeType)
      expect(part.data.href).toBe(`data:${mimeType};base64,UEs=`)
      expect(part.filename).toBe("brief.docx")
    } finally {
      globalThis.fetch = originalFetch
      globalThis.FileReader = originalFileReader
    }
  })
})
