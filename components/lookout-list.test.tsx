import { describe, expect, mock, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { SidebarProvider } from "@/components/ui/sidebar"

mock.module("next/navigation", () => ({
  usePathname: () => "/chat/66666666-6666-4666-8666-666666666666",
}))

import { LookoutList } from "@/components/lookout-list"

describe("LookoutList", () => {
  test("groups an existing report under its Lookout in the sidebar", () => {
    const html = renderToStaticMarkup(
      createElement(
        SidebarProvider,
        null,
        createElement(LookoutList, {
          lookouts: [
            {
              id: "44444444-4444-4444-8444-444444444444",
              name: "Umbrel Update",
              reports: [
                {
                  id: "66666666-6666-4666-8666-666666666666",
                  title: "Umbrel Update",
                  timestamp: "2026-08-24T09:30:00.000Z",
                },
              ],
            },
          ],
        })
      )
    )

    expect(html).toContain("Lookouts")
    expect(html.match(/Umbrel Update/g)?.length).toBeGreaterThanOrEqual(2)
    expect(html).toContain('href="/chat/66666666-6666-4666-8666-666666666666"')
    expect(html).toContain('data-panel-open=""')
  })
})
