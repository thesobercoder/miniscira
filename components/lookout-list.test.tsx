import { describe, expect, mock, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { SidebarProvider } from "@/components/ui/sidebar"

mock.module("next/navigation", () => ({
  usePathname: () => "/chat/66666666-6666-4666-8666-666666666666",
}))

import { LookoutList } from "@/components/lookout-list"

describe("LookoutList", () => {
  test("shows Current plus at most nine dated reports", () => {
    const reports = Array.from({ length: 11 }, (_, index) => ({
      id: `report-${index + 1}`,
      title: `Repeated Lookout title ${index + 1}`,
      timestamp: new Date(Date.UTC(2026, 7, 24 - index, 9, 30)).toISOString(),
    }))
    const html = renderToStaticMarkup(
      createElement(
        SidebarProvider,
        null,
        createElement(LookoutList, {
          lookouts: [
            {
              id: "44444444-4444-4444-8444-444444444444",
              name: "Umbrel Update",
              reports,
            },
          ],
        })
      )
    )

    expect(html).toContain("Lookouts")
    expect(html.match(/Umbrel Update/g)).toHaveLength(1)
    expect(html.match(/href="\/chat\/report-/g)).toHaveLength(10)
    expect(html).toContain('href="/chat/report-1"')
    expect(html).toContain('href="/chat/report-10"')
    expect(html).not.toContain('href="/chat/report-11"')
    expect(html.match(/>Current</g)).toHaveLength(1)
    expect(html).toContain(
      new Date("2026-08-23T09:30:00.000Z").toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      })
    )
    expect(html).not.toContain("Repeated Lookout title")
    expect(html).toContain('data-panel-open=""')
  })
})
