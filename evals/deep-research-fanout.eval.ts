import { defineEval } from "eve/evals"
import { satisfies } from "eve/evals/expect"
import { searchedThenRead } from "./tools"

export default defineEval({
  description:
    "Deep research decomposes into parallel researcher subagents and reads sources before answering.",
  async test(t) {
    const turn = await t.send(
      "Deep research: how has HTTP/3 and QUIC adoption progressed across the major CDNs? Cover support levels, gaps and what is still experimental."
    )
    t.succeeded()

    t.loadedSkill("deep_research")
    t.calledSubagent("researcher").label("delegates sub-questions")

    // The skill says to delegate INDEPENDENT sub-questions in parallel. One
    // delegate is a sequential walk wearing a fan-out's clothes.
    const delegates = turn.toolCalls.filter((c) => c.name === "agent")
    t.check(
      delegates.length,
      satisfies<number>((n) => n >= 2, "at least two researcher delegates")
    ).label("fans out rather than walking sequentially")

    // "Read before you cite" is a hard rule — search snippets alone are not
    // enough for a report-shaped answer.
    t.check(turn.toolCalls, searchedThenRead(turn.toolCalls)).label(
      "searches, then reads"
    )

    t.check(
      t.reply ?? "",
      satisfies<string>(
        (r) => r.length > 800,
        "report-length answer for a deep-research request"
      )
    ).label("answer is a report, not a paragraph")

    t.noFailedActions()
  },
})
