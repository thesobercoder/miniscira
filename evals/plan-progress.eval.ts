import { defineEval } from "eve/evals"
import { satisfies } from "eve/evals/expect"

type TodoItem = { content?: string; status?: string }

const todosIn = (input: unknown): TodoItem[] => {
  const todos = (input as { todos?: unknown })?.todos
  return Array.isArray(todos) ? (todos as TodoItem[]) : []
}

export default defineEval({
  description:
    "A multi-step research question keeps its plan current — the todo list is updated as work lands, not written once and abandoned.",
  async test(t) {
    const turn = await t.send(
      "Compare Bun, Deno and Node for running a TypeScript HTTP server in 2026. Cover startup time, ecosystem maturity and deployment. Be thorough."
    )
    t.succeeded()

    const todoCalls = turn.toolCalls.filter((c) => c.name === "todo")

    // The failure this guards: the agent writes a plan, fans out to parallel
    // researchers, and never touches the list again — so the UI shows
    // "Plan · 0/6 done" next to a finished answer. The instructions name three
    // trigger points precisely because "update as you go" had no hook on a
    // fan-out, where firing three delegates feels like one action.
    t.check(
      todoCalls.length,
      satisfies<number>((n) => n >= 2, "todo called more than once")
    ).label("plan is updated, not just created")

    const last = todoCalls.at(-1)
    const finalTodos = last ? todosIn(last.input) : []

    t.check(
      finalTodos,
      satisfies<TodoItem[]>((items) => items.length > 0, "final todo has items")
    ).label("plan survives to the end of the turn")

    // "Before you write the answer — the list must match what actually
    // happened." An item still pending when the answer ships is the bug.
    t.check(
      finalTodos,
      satisfies<TodoItem[]>(
        (items) =>
          items.every(
            (i) => i.status === "completed" || i.status === "cancelled"
          ),
        "every item resolved in the final todo call"
      )
    ).label("no item left pending when the answer ships")
  },
})
