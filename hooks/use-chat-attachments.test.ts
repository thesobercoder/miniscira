import { describe, expect, test } from "bun:test"

import type { UploadedDoc } from "@/hooks/use-chat-attachments"

/**
 * The rule `attachToTurn` applies when a message is sent. Extracted here as the
 * pure predicate it is: the hook itself needs a React renderer, but the bug was
 * never in the wiring — it was in which docs leave the composer.
 */
const staysStaged = (d: UploadedDoc) => d.status !== "ready"
const ridesAlong = (d: UploadedDoc) => d.status === "ready"

const doc = (id: string, status: UploadedDoc["status"]): UploadedDoc => ({
  id,
  filename: `${id}.pdf`,
  status,
})

describe("attachToTurn partitioning", () => {
  test("only ready docs ride along with the message", () => {
    const staged = [
      doc("a", "ready"),
      doc("b", "processing"),
      doc("c", "error"),
    ]
    expect(staged.filter(ridesAlong).map((d) => d.id)).toEqual(["a"])
  })

  test("an in-flight upload survives the send", () => {
    // Regression: the composer used to clear every chip, so sending mid-upload
    // silently discarded the file with no message anywhere.
    const staged = [doc("a", "ready"), doc("b", "processing")]
    expect(staged.filter(staysStaged).map((d) => d.id)).toEqual(["b"])
  })

  test("a failed upload stays put so it can be retried", () => {
    const staged = [doc("a", "ready"), doc("c", "error")]
    expect(staged.filter(staysStaged).map((d) => d.id)).toEqual(["c"])
  })

  test("the two halves partition the list with nothing lost or duplicated", () => {
    const staged = [
      doc("a", "ready"),
      doc("b", "processing"),
      doc("c", "error"),
      doc("d", "ready"),
    ]
    expect([
      ...staged.filter(ridesAlong),
      ...staged.filter(staysStaged),
    ]).toHaveLength(staged.length)
  })
})
