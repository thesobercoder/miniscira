import { defineEval } from "eve/evals"
import { noWebTools } from "./tools"

export default defineEval({
  description:
    "A question about the user's own files routes to search_documents rather than the web.",
  async test(t) {
    const turn = await t.send(
      "What does my uploaded PDF say about the evaluation datasets? Answer only from my documents."
    )
    t.succeeded()

    // This asserts the ROUTING decision, not the retrieval result. The eval
    // driver talks to the agent directly, so `search_documents` resolves the
    // caller's principal from the eve session rather than a browser cookie —
    // whether it finds rows depends on what that principal has uploaded, which
    // is not a property of the agent. What is a property of the agent: a
    // question about "my PDF" must not be answered by searching the web.
    t.calledTool("search_documents").label("asks the knowledge base")
    t.check(turn.toolCalls, noWebTools(turn.toolCalls)).label(
      "does not fall back to the open web"
    )
  },
})
