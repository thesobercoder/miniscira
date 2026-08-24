import { defineEval } from "eve/evals"
import { satisfies } from "eve/evals/expect"

type Call = { readonly name: string; readonly input: unknown }

export default defineEval({
  description:
    "An explicit date and topic become a combined title and UTC date-range thread search.",
  tags: ["thread-search", "date-search", "routing", "release-gate"],
  async test(t) {
    const turn = await t.send(
      "Find our PostgreSQL discussion from August 23, 2026. Search previous threads before answering."
    )

    t.succeeded()
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
          typeof input.query === "string" &&
          input.query.toLowerCase().includes("postgres") &&
          input.from === "2026-08-23T00:00:00.000Z" &&
          input.to === "2026-08-24T00:00:00.000Z"
        )
      }, "uses the topic and exact half-open UTC day")
    )
  },
})
