import { describe, expect, test } from "bun:test"

import {
  attachmentKind,
  extractDocumentText,
  storedMimeType,
} from "@/lib/document-text"

const OFFICE_FILES = [
  {
    filename: "brief.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    filename: "slides.pptx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
  {
    filename: "budget.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
] as const

describe("office document uploads", () => {
  test("accepts each office format by extension or exact MIME type", () => {
    for (const file of OFFICE_FILES) {
      expect(attachmentKind("", file.filename)).toBe("document")
      expect(attachmentKind(file.mimeType, "upload")).toBe("document")
    }
  })

  test("stores the standard office MIME type when the browser omits it", () => {
    for (const file of OFFICE_FILES) {
      expect(storedMimeType("", file.filename)).toBe(file.mimeType)
    }
  })

  test("does not decode office package bytes as text", async () => {
    for (const file of OFFICE_FILES) {
      expect(
        await extractDocumentText(
          new Uint8Array([80, 75, 3, 4]).buffer,
          file.mimeType,
          file.filename
        )
      ).toBeNull()
    }
  })
})
