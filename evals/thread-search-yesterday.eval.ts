import { defineEval } from "eve/evals"
import { satisfies } from "eve/evals/expect"

import { searchedThenReadPreviousThread } from "./thread-search-tools"

type Call = { readonly name: string; readonly input: unknown }

export default defineEval({
  description:
    "A request about yesterday searches the signed-in user's threads with an absolute UTC range before reading relevant results.",
  tags: ["thread-search", "date-search", "routing", "release-gate"],
  async test(t) {
    const turn = await t.send(
      "What did we talk about yesterday? Search and read the relevant previous threads before answering."
    )

    t.succeeded()
    t.check(turn.toolCalls, searchedThenReadPreviousThread(turn.toolCalls))
    t.check(
      turn.toolCalls,
      satisfies<readonly Call[]>((calls) => {
        const call = calls.find(
          (candidate) => candidate.name === "search_previous_threads"
        )
        if (!call || typeof call.input !== "object" || call.input === null)
          return false
        const input = call.input as Record<string, unknown>
        return (
          input.query === "" &&
          typeof input.from === "string" &&
          typeof input.to === "string" &&
          !Number.isNaN(Date.parse(input.from)) &&
          !Number.isNaN(Date.parse(input.to))
        )
      }, "uses an absolute date-only UTC search range")
    )
  },
})
