import { defineEval } from "eve/evals"
import { satisfies } from "eve/evals/expect"

export default defineEval({
  description:
    "An explicit request for a picture generates one; a request for a chart does not.",
  async test(t) {
    const turn = await t.send(
      "Generate an image of a lighthouse at dusk, painterly style."
    )
    t.succeeded()

    const call = turn.requireToolCall("generate_image")
    t.check(
      String(call.input.prompt ?? ""),
      satisfies<string>(
        (p) => /lighthouse/i.test(p),
        "the prompt carries the subject"
      )
    ).label("prompt reflects the request")

    // The instructions scope this tool to illustration and explicitly exclude
    // charts and data — those belong in run_code with matplotlib. Drawing a
    // "chart" with an image model produces convincing nonsense.
    const chart = t.newSession()
    await chart.send(
      "Chart these quarterly revenues for me: Q1 120, Q2 145, Q3 138, Q4 190."
    )
    chart.succeeded()
    chart
      .notCalledTool("generate_image")
      .label("data goes to code, not an image model")
  },
})
