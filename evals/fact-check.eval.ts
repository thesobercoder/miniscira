import { defineEval } from "eve/evals"
import { satisfies } from "eve/evals/expect"
import { searchedThenRead } from "./tools"

export default defineEval({
  description:
    "A claim to verify loads fact_check, reads primary sources, and reaches a verdict instead of hedging.",
  async test(t) {
    const turn = await t.send(
      "Fact check this claim: 'Rust overtook C++ in the TIOBE index in 2026.' Is it true?"
    )
    t.succeeded()

    t.loadedSkill("fact_check")
    t.check(turn.toolCalls, searchedThenRead(turn.toolCalls)).label(
      "reads before ruling"
    )

    // A fact check that will not commit is not a fact check. The verdict
    // vocabulary is loose on purpose — the skill does not mandate exact words,
    // so pinning them would test the wording rather than the behaviour.
    t.check(
      t.reply ?? "",
      satisfies<string>(
        (r) =>
          /\b(true|false|correct|incorrect|accurate|inaccurate|misleading|unsupported|no evidence|partly)\b/i.test(
            r
          ),
        "states a verdict"
      )
    ).label("commits to a verdict")

    t.check(
      t.reply ?? "",
      satisfies<string>(
        (r) => [...r.matchAll(/\]\(https?:\/\//g)].length >= 1,
        "verdict is sourced"
      )
    ).label("shows its evidence")
  },
})
