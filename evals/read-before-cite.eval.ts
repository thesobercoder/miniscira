import { defineEval } from "eve/evals"
import { satisfies } from "eve/evals/expect"
import { READ_TOOLS, searchedThenRead } from "./tools"

export default defineEval({
  description:
    "Important claims come from pages the agent actually opened, not from search snippets.",
  async test(t) {
    const turn = await t.send(
      "What exactly changed in the latest Node.js LTS release? Be specific about version numbers and features."
    )
    t.succeeded()

    t.check(turn.toolCalls, searchedThenRead(turn.toolCalls)).label(
      "opens sources it found"
    )

    // "Never cite a page you have only seen as a search snippet when the claim
    // is important." A specific-numbers question is exactly that case, so every
    // cited host should be one that was opened.
    //
    // firecrawl_search returns page CONTENT as well as links, so a host cited
    // from it was genuinely read too — but its urls aren't in the tool input,
    // only in the output, so this counts explicit reads and keeps the bar at
    // half rather than demanding every host.
    const fetched = new Set(
      turn.toolCalls
        .filter((c) => (READ_TOOLS as readonly string[]).includes(c.name))
        .flatMap((c) => {
          const urls = (c.input as { urls?: unknown; url?: unknown }).urls
          const single = (c.input as { url?: unknown }).url
          const list = Array.isArray(urls) ? urls : single ? [single] : []
          return list.flatMap((u) => {
            try {
              return [new URL(String(u)).hostname.replace(/^www\./, "")]
            } catch {
              return []
            }
          })
        })
    )

    const cited = [
      ...(t.reply ?? "").matchAll(/\]\((https?:\/\/[^\s)]+)\)/g),
    ].flatMap((m) => {
      try {
        return [new URL(m[1]).hostname.replace(/^www\./, "")]
      } catch {
        return []
      }
    })

    t.check(
      cited,
      satisfies<string[]>((c) => c.length > 0, "answer cites something")
    ).label("cited")

    t.check(
      cited.filter((h) => fetched.has(h)).length / Math.max(cited.length, 1),
      satisfies<number>(
        (ratio) => ratio >= 0.5,
        "most cited hosts were actually opened"
      )
    ).label("citations point at pages it read")
  },
})
