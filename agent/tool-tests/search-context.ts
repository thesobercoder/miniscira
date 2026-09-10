import type { ToolContext } from "eve/tools"

function unused(): never {
  throw new Error("Search provider tools must not access session context")
}

export const searchContext: ToolContext = {
  get session() {
    return unused()
  },
  abortSignal: new AbortController().signal,
  callId: "search-fixture",
  toolName: "search-fixture",
  getToken: unused,
  requireAuth: unused,
  getSandbox: unused,
  getSkill: unused,
}
