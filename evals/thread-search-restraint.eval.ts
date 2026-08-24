import { defineEval } from "eve/evals"

export default defineEval({
  description:
    "An unrelated current question does not trigger previous-thread retrieval.",
  tags: ["thread-search", "restraint", "release-gate"],
  async test(t) {
    const turn = await t.send(
      "Here is all the context you need: PostgreSQL is the database. Write one sentence explaining why a database index helps a title lookup."
    )
    t.succeeded()
    turn
      .notCalledTool("search_previous_threads")
      .label("does not search when current context is sufficient")
    turn
      .notCalledTool("read_previous_thread")
      .label("does not read an unrelated previous thread")
  },
})
