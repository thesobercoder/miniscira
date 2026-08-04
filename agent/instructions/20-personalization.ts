import { defineDynamic, defineInstructions } from "eve/instructions"

import { TONE_META } from "@/lib/tones"
import { getUserSettings } from "@/lib/user-settings"

// The user's standing instructions belong in the system prompt, next to the
// agent's own rules — they are exactly what eve's docs call instructions:
// "anything that should hold on every turn, such as a rule, a persona, or a
// constraint."
//
// They used to ride along as `clientContext` from the composer, which per eve's
// docs is "ephemeral context for the next model call and nothing more" — a
// user-role message that (a) competes with the actual question instead of
// governing the turn, (b) applies to one call only, so a resumed or HITL turn
// never saw it, and (c) "never lands in durable session history", so anything
// after a reload or compaction lost it. That is the most likely reason custom
// instructions and tone appeared to be ignored.
//
// Same shape as 10-memories.ts, which already did this correctly. Anonymous and
// app-principal sessions (schedules, subagents) get nothing.
export default defineDynamic({
  events: {
    "session.started": async (_event, ctx) => {
      const auth = ctx.session.auth.current ?? ctx.session.auth.initiator
      if (auth?.principalType !== "user" || !auth.principalId) return null

      const settings = await getUserSettings(auth.principalId).catch(() => null)
      if (!settings) return null

      const nickname = settings.nickname?.trim()
      const standing = settings.instructions?.trim()
      const tone = TONE_META[settings.tone]?.directive?.trim()
      if (!nickname && !standing && !tone) return null

      const parts = ["## The user's preferences", ""]
      if (nickname) parts.push(`Address the user as **${nickname}**.`, "")
      if (tone) parts.push(tone, "")
      if (standing) {
        parts.push(
          "Standing instructions from the user. These hold for every answer in",
          "this session and outrank your own default style:",
          "",
          standing,
          ""
        )
      }
      parts.push(
        "Follow these without narrating them back. If one genuinely conflicts with",
        "a hard rule above (citation format, never inventing sources), the hard",
        "rule wins. Say so briefly rather than silently ignoring the user."
      )

      return defineInstructions({ markdown: parts.join("\n") })
    },
  },
})
