import { describe, expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { DocumentLinks } from "@/components/timeline/nodes/execution"

describe("DocumentLinks", () => {
  test("renders a download link for every generated document", () => {
    const html = renderToStaticMarkup(
      createElement(DocumentLinks, {
        files: [
          {
            name: "report.docx",
            url: "/api/files/report-a1b2c3d4e5f6.docx",
            mediaType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            size: 120,
          },
          {
            name: "slides.pdf",
            url: "/api/files/slides-a1b2c3d4e5f6.pdf",
            mediaType: "application/pdf",
            size: 80,
          },
        ],
      })
    )

    expect(html).toContain('href="/api/files/report-a1b2c3d4e5f6.docx"')
    expect(html).toContain('download="report.docx"')
    expect(html).toContain("Download report.docx")
    expect(html).toContain('download="slides.pdf"')
  })

  test("renders nothing without files", () => {
    expect(
      renderToStaticMarkup(createElement(DocumentLinks, { files: [] }))
    ).toBe("")
  })
})
