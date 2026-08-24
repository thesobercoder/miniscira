import { defineEval } from "eve/evals"

import { searchedThenReadPreviousThread } from "./thread-search-tools"

export default defineEval({
  description:
    "A continuity question whose answer depends on an unstated prior decision selectively searches and reads previous threads.",
  tags: ["thread-search", "routing", "release-gate"],
  async test(t) {
    const turn = await t.send(
      "Continue the MiniScira search design using the database choice and first-release scope we agreed on before. What should I implement next?"
    )

    t.succeeded()
    t.check(
      turn.toolCalls,
      searchedThenReadPreviousThread(turn.toolCalls)
    ).label("recognises that prior context can change the answer")
  },
})
