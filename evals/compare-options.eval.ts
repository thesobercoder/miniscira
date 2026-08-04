import { defineEval } from "eve/evals"
import { satisfies } from "eve/evals/expect"

export default defineEval({
  description:
    "A head-to-head comparison loads compare_options and answers with a table plus a recommendation.",
  async test(t) {
    await t.send(
      "Compare Postgres, MySQL and SQLite for a small SaaS backend in 2026. Which should I pick?"
    )
    t.succeeded()
    t.loadedSkill("compare_options")

    const reply = t.reply ?? ""

    // A comparison that does not lay the options side by side is just prose
    // about three things.
    t.check(
      reply,
      satisfies<string>(
        (r) => (r.match(/^\|.*\|$/gm) || []).length >= 3,
        "renders a markdown comparison table"
      )
    ).label("options are laid side by side")

    // The user asked which to pick. Listing trade-offs and stopping is the
    // failure mode.
    t.check(
      reply,
      satisfies<string>(
        (r) =>
          /\b(recommend|pick|choose|go with|best fit|i'd|would suggest)\b/i.test(
            r
          ),
        "makes a recommendation"
      )
    ).label("answers the question asked")
  },
})
