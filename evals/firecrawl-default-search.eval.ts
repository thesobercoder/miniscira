import { defineEval } from "eve/evals"
import { satisfies } from "eve/evals/expect"

export default defineEval({
  description:
    "Configured Firecrawl handles general and Reddit research in real chat.",
  tags: ["firecrawl-default", "routing", "release-gate"],
  async test(t) {
    for (const fixture of [
      {
        prompt:
          "Search the web for the current PostgreSQL release. Cite the official release page.",
        tool: "firecrawl_search",
        link: /https:\/\//,
      },
      {
        prompt:
          "Find Reddit opinions about self-hosted search tools and cite the discussions.",
        tool: "reddit_search",
        link: /https?:\/\/(?:www\.)?reddit\.com\//,
      },
    ]) {
      const turn = await t.newSession().send(fixture.prompt)
      t.check(
        turn.status,
        satisfies<string>((status) => status !== "failed", "chat completes")
      )
      t.check(
        turn.toolCalls,
        satisfies<typeof turn.toolCalls>(
          (calls) =>
            calls.filter((call) =>
              [
                "firecrawl_search",
                "exa_search",
                "reddit_search",
                "x_search",
              ].includes(call.name)
            )[0]?.name === fixture.tool,
          `starts with ${fixture.tool}`
        )
      )
      t.check(
        turn.message ?? "",
        satisfies<string>(
          (text) => fixture.link.test(text),
          "returns source links"
        )
      )
    }
  },
})
