import { describe, expect, test } from "bun:test"

import {
  attachmentContentDisposition,
  DOCUMENT_MEDIA_TYPES,
  documentExtension,
  documentMediaType,
  storedDocumentMimeType,
} from "@/lib/document-files"

describe("document files", () => {
  test("maps every supported extension from one record", () => {
    expect(documentMediaType("report.pdf")).toBe(DOCUMENT_MEDIA_TYPES[".pdf"])
    expect(documentMediaType("REPORT.DOCX")).toBe(DOCUMENT_MEDIA_TYPES[".docx"])
    expect(documentMediaType("slides.pptx")).toBe(DOCUMENT_MEDIA_TYPES[".pptx"])
    expect(documentMediaType("budget.xlsx")).toBe(DOCUMENT_MEDIA_TYPES[".xlsx"])
  })

  test("rejects unsupported and misleading suffixes", () => {
    expect(documentExtension("report.pdf.exe")).toBeUndefined()
    expect(documentMediaType("notes.txt")).toBeUndefined()
    expect(documentMediaType("pdf")).toBeUndefined()
  })

  test("normalizes document types from extension or exact MIME", () => {
    expect(storedDocumentMimeType("", "brief.docx")).toBe(
      DOCUMENT_MEDIA_TYPES[".docx"]
    )
    expect(
      storedDocumentMimeType(DOCUMENT_MEDIA_TYPES[".xlsx"], "upload")
    ).toBe(DOCUMENT_MEDIA_TYPES[".xlsx"])
  })

  test("builds an ASCII attachment header from a leaf filename", () => {
    expect(attachmentContentDisposition('../résumé"\r\n.docx')).toBe(
      'attachment; filename="r_sum____.docx"'
    )
    expect(attachmentContentDisposition("folder\\report.xlsx")).toBe(
      'attachment; filename="report.xlsx"'
    )
  })
})
