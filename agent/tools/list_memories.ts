import { defineTool } from "eve/tools"
import { z } from "zod"

import { listMemories } from "@/lib/memories"

// The model sees this tool as `list_memories`, from the filename.
export default defineTool({
  description:
    "List everything saved about the user (each with its id), for when they ask what you remember or you need an id to forget one.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const auth = ctx.session.auth.current
    if (auth?.principalType !== "user" || !auth.principalId) {
      return { error: "No authenticated user.", memories: [] }
    }
    const rows = await listMemories(auth.principalId)
    return {
      memories: rows.map((m) => ({
        id: m.id,
        content: m.content,
        savedAt: m.createdAt.toISOString(),
      })),
    }
  },
})
