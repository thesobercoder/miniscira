import { defineEval } from "eve/evals"
import { includes } from "eve/evals/expect"

export default defineEval({
  description: "The agent answers a simple factual question without dying.",
  async test(t) {
    await t.send("What is the capital of France? Answer in one short sentence.")
    t.succeeded()
    t.check(t.reply, includes("Paris"))
  },
})
