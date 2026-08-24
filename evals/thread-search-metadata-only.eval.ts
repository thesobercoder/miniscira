import { defineEval } from "eve/evals"

import { searchedThenReadPreviousThread } from "./thread-search-tools"

export default defineEval({
  description:
    "A title match is only metadata: the agent reads the selected thread before using its decision.",
  tags: ["thread-search", "routing", "release-gate"],
  async test(t) {
    const turn = await t.send(
      "Find the earlier thread titled like 'PostgreSQL thread search' and tell me the exact Phase 1 boundary we chose. Read it; a matching title alone is not evidence."
    )

    t.succeeded()
    t.check(
      turn.toolCalls,
      searchedThenReadPreviousThread(turn.toolCalls)
    ).label("does not treat title metadata as the answer")
  },
})
