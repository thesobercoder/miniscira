import { defineEval } from "eve/evals"
import { satisfies } from "eve/evals/expect"

/**
 * The valid model pick under test. Env-configurable (12 factor): swap models
 * without touching code. Must differ from the compiled default — if the pick
 * were silently dropped and the fallback answered instead, this eval must
 * still fail, and that only works when the two ids are distinct.
 */
const GOOD_PICK = process.env.EVAL_CHAT_MODEL ?? "glm-5.3-flash"

/**
 * `agent/agent.ts` resolves the per-turn model from a `chatModel` marker eve
 * serializes into a user message from clientContext.
 *
 * Nothing in the public event stream names the model that actually answered —
 * `session.started` reports the compiled `dynamic:<fallback>` identity once per
 * session, and `turn.started` carries no model at all. So this tests the
 * contract behaviourally instead: an unusable pick must reach the gateway and
 * fail. If it answers happily, the pick was ignored and something else replied.
 *
 * That is not hypothetical. The marker was previously extracted by
 * `JSON.stringify`-ing the message array, which escapes the inner quotes of the
 * serialized context to `\"` and never matched — so every chat ran on the
 * compiled model no matter what the composer displayed.
 */
export default defineEval({
  description:
    "A model pick in clientContext is honoured — a valid one answers, an unusable one fails loudly instead of falling back.",
  async test(t) {
    const fallback = (await import("@/lib/models")).DEFAULT_CHAT_MODEL
    if (GOOD_PICK === fallback) {
      t.skip(
        `EVAL_CHAT_MODEL "${GOOD_PICK}" equals the compiled default — the routing distinction is untestable`
      )
    }
    const good = await t.send({
      message: "Reply with exactly: ROUTED",
      clientContext: { chatModel: GOOD_PICK },
    })
    t.check(
      good.status,
      satisfies<string>((s) => s !== "failed", "a valid pick answers")
    ).label("valid pick works")
    t.check(
      good.message ?? "",
      satisfies<string>((m) => /ROUTED/i.test(m), "answered the prompt")
    ).label("answered")

    // The load-bearing half: silence here means the pick is being dropped.
    const bad = t.newSession()
    const failed = await bad.send({
      message: "Say OK.",
      clientContext: { chatModel: "openai/model-that-does-not-exist-xyz" },
    })
    t.check(
      failed.status,
      satisfies<string>(
        (s) => s === "failed",
        "an unusable pick fails the turn rather than silently falling back"
      )
    ).label("no silent downgrade")
  },
})
