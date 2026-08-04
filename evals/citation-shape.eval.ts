import { defineEval } from "eve/evals"
import { satisfies } from "eve/evals/expect"
import { searched } from "./tools"

const LINK = /\[([^\]]*)\]\((https?:\/\/[^\s)]*)\)/g
/** Two or more links separated by whitespace alone — a dumped source list. */
const ADJACENT_RUN =
  /(?:\*\*)?\[[^\]]*\]\([^\s)]*\)(?:\*\*)?(?:[ \t]+(?:\*\*)?\[[^\]]*\]\([^\s)]*\)(?:\*\*)?)+/

export default defineEval({
  description:
    "Citations sit inline on the words they support, not as a run of source names trailing the sentence.",
  async test(t) {
    const turn = await t.send(
      "What is HTTP/3 and why did browsers adopt it? Two short paragraphs, cite as you go."
    )
    t.succeeded()
    t.check(turn.toolCalls, searched(turn.toolCalls)).label("searched the web")

    const reply = t.reply ?? ""

    t.check(
      reply,
      satisfies<string>(
        (r) => [...r.matchAll(LINK)].length >= 2,
        "answer carries at least two markdown links"
      )
    ).label("cited at all")

    // The documented GOOD shape links the claim words: `[dropped to 340ms](url)`.
    // The documented MISTAKE is a source name or bare domain — `[(wiki)](url)`,
    // `[caniuse.com/http3](url)`. The renderer folds those into favicon chips so
    // they don't wreck the prose, but that is damage control, not the target.
    const labels = [...reply.matchAll(LINK)].map((m) => m[1])
    const sourceNameish = labels.filter(
      (l) =>
        /^\(.*\)$/.test(l) ||
        /^(?:https?:\/\/)?[\w-]+(?:\.[\w-]+)+/.test(l) ||
        l.split(/\s+/).length <= 2
    )

    t.check(
      sourceNameish.length / Math.max(labels.length, 1),
      satisfies<number>(
        (ratio) => ratio < 0.5,
        "most link labels are claim words, not source names"
      )
    ).label("citations anchor on claims, not source names")

    // The shape that actually looked broken in the app: three long links jammed
    // together at the end of a paragraph.
    t.check(
      reply,
      satisfies<string>(
        (r) => !ADJACENT_RUN.test(r),
        "no run of back-to-back links"
      )
    ).label("no trailing source dump")
  },
})
