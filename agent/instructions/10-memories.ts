import { defineDynamic, defineInstructions } from "eve/instructions"

import { listMemories } from "@/lib/memories"

// Load the signed-in user's saved memories into the system prompt once per
// session, so answers respect their preferences without a tool round-trip.
// Anonymous and app-principal sessions (schedules, subagents) get nothing.
export default defineDynamic({
  events: {
    "session.started": async (_event, ctx) => {
      const auth = ctx.session.auth.current ?? ctx.session.auth.initiator
      if (auth?.principalType !== "user" || !auth.principalId) return null

      const rows = await listMemories(auth.principalId).catch(() => [])
      if (rows.length === 0) {
        return defineInstructions({
          markdown:
            "## Memory\n\nYou can save durable user facts with the `remember` tool. When the user shares a lasting preference, interest, or standing instruction, save it (one short sentence). Use `forget` when they ask you to drop one.",
        })
      }

      const list = rows.map((m) => `- ${m.content} (id: ${m.id})`).join("\n")
      return defineInstructions({
        markdown:
          `## What you remember about this user\n\n${list}\n\n` +
          "Respect these when relevant — don't recite them unprompted. Save new lasting facts with `remember`; remove outdated ones with `forget` when asked.",
      })
    },
  },
})
