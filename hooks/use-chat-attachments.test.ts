import { describe, expect, test } from "bun:test"

import {
  DOC_ACCEPT,
  isModelFileAttachment,
  OFFICE_MIME_TYPES,
  snapshotReadyAttachments,
  type UploadedDoc,
} from "@/hooks/use-chat-attachments"

const staysStaged = (d: UploadedDoc) => d.status !== "ready"
const ridesAlong = (d: UploadedDoc) => d.status === "ready"

const doc = (id: string, status: UploadedDoc["status"]): UploadedDoc => ({
  id,
  filename: `${id}.pdf`,
  status,
})

describe("ready attachment snapshots", () => {
  test("only ready docs ride along with the message", () => {
    const staged = [
      doc("a", "ready"),
      doc("b", "processing"),
      doc("c", "error"),
    ]
    expect(staged.filter(ridesAlong).map((d) => d.id)).toEqual(["a"])
  })

  test("an in-flight upload survives the send", () => {
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

  test("acceptance removes only the ready documents in the snapshot", () => {
    const staged = [
      doc("a", "ready"),
      doc("b", "processing"),
      doc("c", "error"),
    ]
    const snapshot = snapshotReadyAttachments(staged)

    expect(snapshot.attachments.map((document) => document.id)).toEqual(["a"])
    expect(snapshot.accept(staged).map((document) => document.id)).toEqual([
      "b",
      "c",
    ])
  })

  test("acceptance is idempotent and leaves newer ready documents staged", () => {
    const snapshot = snapshotReadyAttachments([doc("a", "ready")])
    const current = [doc("a", "ready"), doc("b", "ready")]
    const accepted = snapshot.accept(current)

    expect(accepted.map((document) => document.id)).toEqual(["b"])
    expect(snapshot.accept(accepted)).toEqual(accepted)
  })
})

describe("office attachments", () => {
  test("the file picker includes every accepted image extension", () => {
    const accepted = DOC_ACCEPT.split(",")
    for (const extension of [
      ".avif",
      ".bmp",
      ".gif",
      ".heic",
      ".heif",
      ".jpeg",
      ".jpg",
      ".png",
      ".tif",
      ".tiff",
      ".webp",
    ]) {
      expect(accepted).toContain(extension)
    }
  })

  test("the file picker accepts office extensions and exact MIME types", () => {
    const accepted = DOC_ACCEPT.split(",")
    for (const extension of [".docx", ".pptx", ".xlsx"]) {
      expect(accepted).toContain(extension)
    }
    for (const mimeType of OFFICE_MIME_TYPES) {
      expect(accepted).toContain(mimeType)
    }
  })

  test("office documents are staged for run_code instead of sent to the model", () => {
    for (const [index, mimeType] of OFFICE_MIME_TYPES.entries()) {
      expect(
        isModelFileAttachment({
          id: `office-${index}`,
          filename: `office-${index}`,
          status: "ready",
          kind: "document",
          mimeType,
        })
      ).toBe(false)
    }
  })

  test("ordinary indexed text documents are not sent as file parts", () => {
    expect(
      isModelFileAttachment({
        id: "text-1",
        filename: "notes.txt",
        status: "ready",
        kind: "document",
        mimeType: "text/plain",
      })
    ).toBe(false)
  })
})
