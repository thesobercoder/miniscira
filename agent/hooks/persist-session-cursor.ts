import { eq } from "drizzle-orm"
import { defineHook } from "eve/hooks"

import { db } from "@/lib/db"
import { chat } from "@/lib/db/schema"

// Persist the continuation token server-side every time the session parks.
// The browser also PATCHes the cursor as it streams, but a tab that dies
// mid-turn used to leave the chat with a stale token (and a dead resume).
// This hook makes the durable runtime the source of truth for the cursor.
export default defineHook({
  events: {
    async "session.waiting"(event, ctx) {
      const token = (event.data as { continuationToken?: string } | undefined)
        ?.continuationToken
      if (!token) return
      try {
        await db
          .update(chat)
          .set({ continuationToken: token, updatedAt: new Date() })
          .where(eq(chat.eveSessionId, ctx.session.id))
      } catch (err) {
        console.error("cursor persist hook failed", err)
      }
    },
  },
})
