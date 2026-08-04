import { defineEval } from "eve/evals"
import { satisfies } from "eve/evals/expect"

export default defineEval({
  description:
    "Questions about discussion and sentiment reach for the social tools, not just the open web.",
  async test(t) {
    const turn = await t.send(
      "What are developers actually saying about Bun 1.3 on X and Reddit? Summarise the sentiment."
    )
    t.succeeded()

    // Either social tool satisfies the routing decision; requiring both would
    // encode a preference the instructions do not state.
    const social = turn.toolCalls.filter(
      (c) => c.name === "x_search" || c.name === "reddit_search"
    )
    t.check(
      social.length,
      satisfies<number>((n) => n >= 1, "used x_search or reddit_search")
    ).label("routes to social sources")

    t.check(
      t.reply ?? "",
      satisfies<string>(
        (r) => [...r.matchAll(/\]\(https?:\/\//g)].length >= 1,
        "cites what it read"
      )
    ).label("cited")
  },
})
