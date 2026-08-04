import { defineEval } from "eve/evals"

/**
 * Skills are loaded by the model reading its own instructions, so the routing
 * is a prompt behaviour with no type system behind it — exactly the thing that
 * rots silently when the instructions are edited.
 */
export default defineEval({
  description:
    "Recency questions load news_brief; a thorough multi-part question loads deep_research.",
  async test(t) {
    await t.send("What's new with xAI this week? Keep it short.")
    t.succeeded()
    t.loadedSkill("news_brief").label("recency question → news_brief")

    // Deliberately NOT phrased as a comparison. An earlier version asked to
    // "compare solid-state battery programmes", and the agent loaded
    // compare_options — correctly. The eval was testing its own prompt.
    const deep = t.newSession()
    await deep.send(
      "Do thorough research on how solid-state battery manufacturing scaled through 2026: what changed technically, who shipped, and what is still unsolved."
    )
    deep.succeeded()
    deep.loadedSkill("deep_research").label("thorough question → deep_research")
  },
})
