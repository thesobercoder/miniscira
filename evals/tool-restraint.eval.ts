import { defineEval } from "eve/evals"
import { includes } from "eve/evals/expect"
import { noWebTools } from "./tools"

export default defineEval({
  description:
    "A trivial factual question is answered directly — no plan, no search, no delegation.",
  async test(t) {
    const turn = await t.send("What is 17 times 4? Reply with just the number.")
    t.succeeded()
    t.check(t.reply, includes("68"))

    // The instructions gate planning on "anything beyond a trivial factual
    // lookup", and the research tools on questions where recency or sources
    // matter. Arithmetic is neither. This is the counterweight to
    // plan-progress.eval.ts: that one pushes the agent to plan and update,
    // and without a restraint check the cheapest way to satisfy it is to plan
    // for everything.
    t.notCalledTool("todo").label("no plan for a trivial question")
    t.check(turn.toolCalls, noWebTools(turn.toolCalls)).label(
      "no web search for arithmetic"
    )
    t.notCalledTool("agent").label("no delegation for arithmetic")
    t.maxToolCalls(1).label("at most one tool call")
  },
})
