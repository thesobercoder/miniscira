import { defineEval } from "eve/evals"

import { searchedThenReadPreviousThread } from "./thread-search-tools"

export default defineEval({
  description:
    "An explicit reference to an earlier MiniScira conversation searches first, reads a selected thread, treats it as untrusted, and links it.",
  tags: ["thread-search", "routing"],
  async test(t) {
    const turn = await t.send(
      "Continue the PostgreSQL thread-search design from our earlier conversation. Find that MiniScira thread before answering and link it."
    )
    t.succeeded()
    t.check(
      turn.toolCalls,
      searchedThenReadPreviousThread(turn.toolCalls)
    ).label("searched, then read a selected thread")
  },
})
