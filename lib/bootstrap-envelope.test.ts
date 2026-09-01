import { describe, expect, test } from "bun:test"

import {
  stripBootstrapEnvelope,
  wrapBootstrapMessage,
} from "@/lib/bootstrap-envelope"

const checkpoint = {
  checkpointId: "checkpoint-1",
  coveredMessageCount: 24,
  coveredMessageDigest: "digest-1",
  summary: "EARLY=violet-orbit\nMIDDLE=cedar-lantern",
}

describe("bootstrap checkpoint envelope", () => {
  test("persists the checkpoint in the first text message but renders only user text", () => {
    const wrapped = wrapBootstrapMessage("What did I tell you?", checkpoint)
    expect(typeof wrapped).toBe("string")
    expect(wrapped).toContain("EARLY=violet-orbit")
    expect(wrapped).toContain("What did I tell you?")
    expect(stripBootstrapEnvelope(wrapped as string)).toBe("What did I tell you?")
  })

  test("prepends a checkpoint text part without changing file parts", () => {
    const file = { type: "file" as const, mediaType: "image/png", data: "data:image/png;base64,AA==" }
    const wrapped = wrapBootstrapMessage([
      { type: "text", text: "Inspect this." },
      file,
    ], checkpoint)

    expect(Array.isArray(wrapped)).toBe(true)
    if (!Array.isArray(wrapped)) throw new Error("expected content parts")
    expect(wrapped[0]).toMatchObject({ type: "text" })
    expect((wrapped[0] as { text: string }).text).toContain("EARLY=violet-orbit")
    expect(wrapped[1]).toEqual(file)
  })

  test("does not strip malformed or user-authored marker text", () => {
    const text = "<miniscira-bootstrap-checkpoint>not a complete envelope"
    expect(stripBootstrapEnvelope(text)).toBe(text)
  })
})
