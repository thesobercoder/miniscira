import { describe, expect, mock, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { SidebarNav } from "@/components/sidebar-nav"
import { SidebarProvider } from "@/components/ui/sidebar"

mock.module("next/navigation", () => ({
  usePathname: () => "/lookouts",
}))

describe("SidebarNav", () => {
  test("shows one Lookouts link without an expanded Lookout list", () => {
    const html = renderToStaticMarkup(
      createElement(SidebarProvider, null, createElement(SidebarNav))
    )

    expect(html.match(/href="\/lookouts"/g)).toHaveLength(1)
    expect(html.match(/>Lookouts</g)).toHaveLength(1)
    expect(html).not.toContain("No reports yet")
  })
})
