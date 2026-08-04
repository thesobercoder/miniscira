import { defineTool } from "eve/tools"
import { z } from "zod"

import { deleteMemory, listMemories } from "@/lib/memories"

// The model sees this tool as `forget`, from the filename.
export default defineTool({
  description:
    "Delete one of the user's saved memories when they ask you to forget something or a saved fact is outdated. Pass the memory id (memories and their ids are listed in your instructions, or via list_memories).",
  inputSchema: z.object({
    id: z.string().uuid().describe("The id of the memory to delete."),
  }),
  async execute({ id }, ctx) {
    const auth = ctx.session.auth.current
    if (auth?.principalType !== "user" || !auth.principalId) {
      return { error: "No authenticated user." }
    }
    const deleted = await deleteMemory(auth.principalId, id)
    if (!deleted) {
      const remaining = await listMemories(auth.principalId)
      return {
        deleted: false,
        error: "No memory with that id.",
        memories: remaining.map((m) => ({ id: m.id, content: m.content })),
      }
    }
    return { deleted: true }
  },
})
