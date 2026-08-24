import { defineTool } from "eve/tools"
import { z } from "zod"

import {
  clearThreadSearchGrant,
  replaceThreadSearchGrant,
  threadSearchGrantKey,
} from "@/agent/thread-search-grants"
import {
  AGENT_THREAD_SEARCH_LIMIT,
  activeThreadScope,
  searchPreviousThreads,
} from "@/lib/thread-search"

export default defineTool({
  description:
    "Search the signed-in user's previous MiniScira thread titles. Use selectively when the user refers to an earlier conversation or prior context could change the answer. Returns compact metadata only; call read_previous_thread after selecting a result.",
  inputSchema: z.object({
    query: z
      .string()
      .max(200)
      .describe("Words from the previous thread's title."),
  }),
  async execute({ query }, ctx) {
    const auth = ctx.session.auth.current
    if (auth?.principalType !== "user" || !auth.principalId)
      return {
        error: "No authenticated user — cannot search threads.",
        results: [],
      }

    const rootSessionId = ctx.session.parent?.rootSessionId ?? ctx.session.id
    const grantKey = threadSearchGrantKey(auth.principalId, rootSessionId)
    const scope = await activeThreadScope(rootSessionId, auth.principalId)
    if (!scope) {
      clearThreadSearchGrant(grantKey)
      return {
        error: "Previous-thread retrieval is unavailable for this session.",
        results: [],
      }
    }
    const results = await searchPreviousThreads({
      userId: auth.principalId,
      query,
      currentChatId: scope?.currentChatId,
      projectId: scope?.projectId,
      limit: AGENT_THREAD_SEARCH_LIMIT,
    })
    replaceThreadSearchGrant(
      grantKey,
      results.map((result) => result.id)
    )
    return {
      query,
      results: results.map((result) => ({
        ...result,
        url: `/chat/${result.id}`,
      })),
      ...(results.length === 0 && {
        note: "No matching previous threads found.",
      }),
    }
  },
})
