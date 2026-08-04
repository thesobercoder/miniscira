import { defineEval } from "eve/evals"
import { includes, satisfies } from "eve/evals/expect"

export default defineEval({
  description:
    "A durable personal fact is written with `remember`, and is available to a later, separate session.",
  async test(t) {
    const stored = await t.send(
      "Remember that I always want answers in British English and metric units."
    )
    t.succeeded()

    const write = stored.requireToolCall("remember")
    t.check(
      JSON.stringify(write.input).toLowerCase(),
      satisfies<string>(
        (s) => s.includes("british") || s.includes("metric"),
        "the stored memory carries the preference"
      )
    ).label("remembers the fact, not a paraphrase of the request")

    // Memories are injected into the system prompt of later sessions
    // (agent/instructions/10-memories.ts), so a fresh session is the real test —
    // the same session could simply be reading its own transcript.
    const later = t.newSession()
    const recalled = await later.send(
      "What units and spelling do I prefer? One short sentence."
    )
    later.succeeded()
    t.check(recalled.message ?? "", includes(/metric/i)).label(
      "recalls across sessions"
    )
  },
})
