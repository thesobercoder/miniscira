import { describe, expect, mock, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
}))

import { type Lookout, LookoutsView } from "@/components/lookouts-view"

const lookout: Lookout = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Robotics watch",
  prompt: "Track robotics news",
  cron: "0 9 * * *",
  runAt: null,
  frequency: "daily",
  timezone: "UTC",
  status: "active",
  nextRunAt: "2026-08-25T09:00:00.000Z",
  lastRunAt: "2026-08-24T09:00:00.000Z",
  reports: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      title: "Robotics report",
      timestamp: "2026-08-24T09:00:00.000Z",
      reportChatId: "66666666-6666-4666-8666-666666666666",
      status: "succeeded",
      incomplete: false,
    },
  ],
}

describe("LookoutsView", () => {
  test("renders report threads inside their Lookout group", () => {
    const html = renderToStaticMarkup(
      createElement(LookoutsView, { initial: [lookout] })
    )

    expect(html).toContain("Robotics watch")
    expect(html).toContain("Robotics report")
    expect(html).toContain('href="/chat/66666666-6666-4666-8666-666666666666"')
  })
})
