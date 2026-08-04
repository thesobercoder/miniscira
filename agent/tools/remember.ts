import { defineTool } from "eve/tools"
import { z } from "zod"

import { saveMemory } from "@/lib/memories"

// The model sees this tool as `remember`, from the filename.
export default defineTool({
  description:
    "Save a durable fact about the user for future conversations — a preference, interest, constraint, or standing instruction they shared. Keep it to one short sentence. Never save secrets, credentials, or sensitive personal data.",
  inputSchema: z.object({
    content: z
      .string()
      .min(3)
      .max(500)
      .describe("The fact to remember, phrased as one sentence."),
  }),
  async execute({ content }, ctx) {
    const auth = ctx.session.auth.current
    if (auth?.principalType !== "user" || !auth.principalId) {
      return { error: "No authenticated user — nothing to remember against." }
    }
    try {
      const row = await saveMemory(auth.principalId, content)
      return { saved: true, id: row.id, content: row.content }
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Couldn't save the memory.",
      }
    }
  },
})
