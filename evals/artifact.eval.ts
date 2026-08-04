import { defineEval } from "eve/evals"
import { satisfies } from "eve/evals/expect"

export default defineEval({
  description:
    "A request for a standalone deliverable produces an artifact, not a wall of chat prose.",
  async test(t) {
    const turn = await t.send(
      "Write me a self-contained HTML page with a dark-themed pricing table for three tiers. Just the page."
    )
    t.succeeded()

    const call = turn.requireToolCall("artifact")
    const input = call.input as { title?: string; content?: string }

    t.check(
      String(input.content ?? ""),
      satisfies<string>(
        (c) => c.includes("<") && c.length > 200,
        "artifact carries the actual document"
      )
    ).label("content lives in the artifact")

    t.check(
      String(input.title ?? ""),
      satisfies<string>((s) => s.trim().length > 0, "artifact is titled")
    ).label("titled for the panel")

    // The failure mode is duplication: the whole page in the artifact AND
    // pasted into the reply, which is what the artifact exists to avoid.
    t.check(
      t.reply ?? "",
      satisfies<string>(
        (r) => !r.includes("<!DOCTYPE") && !r.includes("<html"),
        "the reply does not repeat the document"
      )
    ).label("chat summarises, artifact holds")
  },
})
