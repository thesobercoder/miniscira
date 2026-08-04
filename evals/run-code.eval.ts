import { defineEval } from "eve/evals"
import { includes, satisfies } from "eve/evals/expect"

export default defineEval({
  description:
    "Real computation goes to the Python sandbox rather than being done in the model's head.",
  async test(t) {
    const turn = await t.send(
      "Using Python, compute the standard deviation of [2, 4, 4, 4, 5, 5, 7, 9] (population, not sample) and report it to three decimal places."
    )
    t.succeeded()

    // `calledTool`, not `requireToolCall`: the latter demands EXACTLY one call,
    // and a model that runs a script, reads the output and refines it has done
    // nothing wrong. What matters is that the computation happened in Python.
    t.calledTool("run_code").label("used the sandbox")

    const calls = turn.toolCalls.filter((c) => c.name === "run_code")
    t.check(
      calls.map((c) => String(c.input.code ?? "")).join(""),
      satisfies<string>((c) => c.length > 0, "sent actual code")
    ).label("wrote a script")

    // Population sd of that classic set is exactly 2.
    t.check(t.reply ?? "", includes(/2\.0{2,}|2\.0|(?<!\d)2(?!\d)/)).label(
      "reports the correct value"
    )

    t.noFailedActions().label("the sandbox ran it without erroring")
  },
})
