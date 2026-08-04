import { defineEval } from "eve/evals"
import { includes } from "eve/evals/expect"
import { searched } from "./tools"

export default defineEval({
  description:
    "A current-events question triggers web research and an inline-linked answer.",
  async test(t) {
    const turn = await t.send(
      "What did Apple announce most recently? Keep it brief."
    )
    t.succeeded()
    t.check(turn.toolCalls, searched(turn.toolCalls)).label("searched the web")
    // Inline citations are a hard rule in the instructions — the answer
    // should carry at least one markdown link.
    t.check(t.reply, includes("]("))
  },
})
