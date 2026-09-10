import { afterEach, expect, test } from "bun:test"
import researcherExa from "../subagents/researcher/tools/exa_search"
import researcherMap from "../subagents/researcher/tools/firecrawl_map"
import researcherScrape from "../subagents/researcher/tools/firecrawl_scrape"
import researcherSearch from "../subagents/researcher/tools/firecrawl_search"
import researcherReddit from "../subagents/researcher/tools/reddit_search"
import researcherX from "../subagents/researcher/tools/x_search"
import exa from "../tools/exa_search"
import firecrawlMap from "../tools/firecrawl_map"
import firecrawlScrape from "../tools/firecrawl_scrape"
import firecrawlSearch from "../tools/firecrawl_search"
import reddit from "../tools/reddit_search"
import x from "../tools/x_search"
import { searchContext } from "./search-context"

const keys = [
  "FIRECRAWL_API_KEY",
  "FIRECRAWL_API_URL",
  "EXA_API_KEY",
  "XAI_API_KEY",
] as const
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
afterEach(() => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
})

const agents = {
  root: [firecrawlSearch, firecrawlScrape, firecrawlMap, reddit, exa, x],
  researcher: [
    researcherSearch,
    researcherScrape,
    researcherMap,
    researcherReddit,
    researcherExa,
    researcherX,
  ],
}

for (const [agent, tools] of Object.entries(agents)) {
  test(`${agent} resolves provider availability at runtime after import`, () => {
    const resolve = () =>
      tools
        .map((definition) =>
          definition.events["step.started"]?.(
            {},
            {
              get session() {
                return searchContext.session
              },
              channel: {},
              messages: [],
            }
          )
        )
        .map(Boolean)
    for (const key of keys) process.env[key] = "  "
    expect(resolve()).toEqual([false, false, false, false, false, false])
    process.env.FIRECRAWL_API_KEY = "fixture-key"
    expect(resolve()).toEqual([true, true, true, true, false, false])
    delete process.env.FIRECRAWL_API_KEY
    process.env.FIRECRAWL_API_URL = "http://firecrawl.local"
    expect(resolve()).toEqual([true, true, true, true, false, false])
    delete process.env.FIRECRAWL_API_URL
    process.env.EXA_API_KEY = "fixture-key"
    expect(resolve()).toEqual([false, false, false, false, true, false])
    process.env.XAI_API_KEY = "fixture-key"
    expect(resolve()).toEqual([false, false, false, false, true, true])
    process.env.FIRECRAWL_API_KEY = "fixture-key"
    expect(resolve()).toEqual([true, true, true, true, true, true])
    for (const key of keys) delete process.env[key]
    expect(resolve()).toEqual([false, false, false, false, false, false])
  })
}
