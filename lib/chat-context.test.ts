import { describe, expect, test } from "bun:test"

import { conversationRecap } from "@/lib/chat-context"
import {
  longConversationFixture,
  RETENTION_FACTS,
} from "@/lib/long-conversation-fixture"

describe("conversationRecap", () => {
  test("retains facts from the early, middle, and recent thirds", () => {
    const recap = conversationRecap(longConversationFixture())

    expect(recap).toContain(RETENTION_FACTS.early)
    expect(recap).toContain(RETENTION_FACTS.middle)
    expect(recap).toContain(RETENTION_FACTS.recent)
  })
})
