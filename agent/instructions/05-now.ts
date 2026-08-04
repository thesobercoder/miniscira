import { defineDynamic, defineInstructions } from "eve/instructions"

// Without this, the model has no idea what day it is and silently falls back to
// its training cutoff: a query asking for "as of 2026" comes back scoped to
// 2025, and every delegated research task inherits the wrong window. The
// recency rule in 00-core.md ("prefer the most recent reliable source") is
// unfollowable without it.
//
// Resolved on `turn.started`, not `session.started`. eve sessions are durable
// and resumable, so a thread picked up days later would otherwise still be
// told the date it started on. A plain instructions module would be worse
// still — those are captured into the build manifest and never re-run, which
// would freeze the date at deploy time.
export default defineDynamic({
  events: {
    "turn.started": () => {
      const now = new Date()
      const iso = now.toISOString().slice(0, 10)
      const long = now.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      })

      return defineInstructions({
        markdown: [
          "## Today's date",
          "",
          `Today is **${long}** (${iso}, UTC).`,
          "",
          "- Treat this as the current date. It is later than your training data,",
          "  so do not assume the newest thing you know about is the newest that",
          "  exists — search before concluding anything is current.",
          "- When the user names a year or window, research *that* window. Do not",
          "  silently narrow it to what you already know.",
          "- Give subagents the same window you were given, stated explicitly.",
        ].join("\n"),
      })
    },
  },
})
