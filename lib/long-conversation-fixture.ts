import type { EveMessage } from "eve/client"

export const RETENTION_FACTS = {
  early: "EARLY_07=violet-orbit",
  middle: "MIDDLE_07=cedar-lantern",
  recent: "RECENT_07=glass-river",
} as const

const positions = new Map<number, string>([
  [1, RETENTION_FACTS.early],
  [12, RETENTION_FACTS.middle],
  [22, RETENTION_FACTS.recent],
])

export function longConversationFixture(): EveMessage[] {
  return Array.from({ length: 24 }, (_, index) => {
    const fact = positions.get(index)
    const text = fact
      ? `Remember this exact fact: ${fact}`
      : `Filler turn ${index.toString().padStart(2, "0")}: ${"context ".repeat(24)}`
    return {
      id: `fixture-${index}`,
      role: index % 2 === 0 ? "assistant" : "user",
      parts: [{ type: "text", text, state: "done" }],
    } satisfies EveMessage
  })
}
