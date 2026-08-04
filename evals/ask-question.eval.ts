import { defineEval } from "eve/evals"
import { satisfies } from "eve/evals/expect"
import { searched } from "./tools"

export default defineEval({
  description:
    "A genuinely ambiguous request asks once before doing heavy work, then continues with the answer.",
  async test(t) {
    // "Ambiguous in a way that changes the answer" is the instruction's bar:
    // Mercury the planet and Mercury the element share no research at all.
    await t.start(
      "Do thorough research on Mercury and tell me what matters most about it."
    )
    await t.sleep(2000)

    const request = t.requireInputRequest()
    t.check(
      request.prompt ?? "",
      satisfies<string>(
        (p) => p.trim().length > 0,
        "the question actually says what is unclear"
      )
    ).label("asks something answerable")

    const option = request.options?.[0]?.id
    const resumed = option
      ? await t.respondAll(option)
      : await t.respond({ requestId: request.requestId, text: "The planet." })

    // Parking is only useful if the turn resumes into real work afterwards.
    t.check(
      resumed.status,
      satisfies<string>((s) => s === "completed", "turn resumed to completion")
    ).label("resumes after the answer")
    t.check(resumed.toolCalls, searched(resumed.toolCalls)).label(
      "does the research once unblocked"
    )
  },
})
