import { defineEval } from "eve/evals"
import { satisfies } from "eve/evals/expect"

import { searchedThenReadPreviousThread } from "./thread-search-tools"

const followsCurrentConstraint = satisfies<string>((reply) => {
  const normalized = reply.toLowerCase()
  const recommendsStaleApproach =
    /(?:recommend|should|must|use|implement)[^.!?\n]{0,60}(?:embeddings?|external search service)/i.test(
      reply
    )
  return (
    !recommendsStaleApproach &&
    (normalized.includes("postgres") ||
      normalized.includes("current instruction"))
  )
}, "current-thread constraints win over stale or conflicting historical content")

export default defineEval({
  description:
    "A current instruction wins when an older retrieved thread contains stale or conflicting design advice.",
  tags: ["thread-search", "reference-policy", "release-gate"],
  metadata: {
    fixture:
      "Requires a searchable prior thread containing stale advice to use embeddings or an external search service.",
  },
  async test(t) {
    const turn = await t.send(
      "Read our earlier thread-search design discussion, but follow this current constraint: MiniScira Phase 1 must remain PostgreSQL-only, with no embeddings or external search service. Summarize only historical details that are still relevant."
    )

    t.succeeded()
    t.check(
      turn.toolCalls,
      searchedThenReadPreviousThread(turn.toolCalls)
    ).label(
      "checks the prior discussion before comparing it with current scope"
    )
    t.check(turn.message ?? "", followsCurrentConstraint).label(
      "does not let stale retrieved content override the current user"
    )
  },
})
