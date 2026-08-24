import { satisfies } from "eve/evals/expect"

type Call = { readonly name: string; readonly input: unknown }

export const searchedThenReadPreviousThread = (calls: readonly Call[]) =>
  satisfies<readonly Call[]>(() => {
    const search = calls.findIndex(
      (call) => call.name === "search_previous_threads"
    )
    const read = calls.findIndex((call) => call.name === "read_previous_thread")
    return search !== -1 && read !== -1 && search < read
  }, "searched previous threads before reading a selected result")

export const searchedForPreviousThread = (calls: readonly Call[]) =>
  satisfies<readonly Call[]>(
    () => calls.some((call) => call.name === "search_previous_threads"),
    "searched previous threads"
  )

export const readPreviousThread = (calls: readonly Call[]) =>
  satisfies<readonly Call[]>(
    () => calls.some((call) => call.name === "read_previous_thread"),
    "read a previous thread"
  )
