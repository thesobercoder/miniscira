import { describe, expect, test } from "bun:test"

import { changedDocumentFiles } from "@/lib/document-files"

describe("changedDocumentFiles", () => {
  test("returns newly created and rewritten supported documents", () => {
    expect(
      changedDocumentFiles(
        [
          { name: "old.pdf", size: 10, modifiedNanoseconds: 1 },
          { name: "report.docx", size: 20, modifiedNanoseconds: 1 },
        ],
        [
          { name: "old.pdf", size: 10, modifiedNanoseconds: 1 },
          { name: "report.docx", size: 21, modifiedNanoseconds: 2 },
          { name: "slides.pptx", size: 30, modifiedNanoseconds: 1 },
          { name: "notes.txt", size: 10, modifiedNanoseconds: 1 },
        ]
      ).map((file) => file.name)
    ).toEqual(["report.docx", "slides.pptx"])
  })

  test("does not publish an untouched staged document", () => {
    const report = { name: "report.docx", size: 20, modifiedNanoseconds: 1 }
    expect(changedDocumentFiles([report], [report])).toEqual([])
  })
})
