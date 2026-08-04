import { defineAgent } from "eve"

import { chatModel } from "@/lib/gateway"
import { DEFAULT_CHAT_MODEL } from "@/lib/models"

// A focused research specialist the root delegates sub-questions to during deep
// research. It carries only the search/fetch tools (no artifact, image, memory,
// or MCP tools) and a tight research + citation prompt, so each parallel branch
// runs a leaner, cheaper context than a full root-agent copy would. Declared
// subagents inherit nothing from the root — its tools live under ./tools.
//
// eve's built-in `web_search` / `web_fetch` are switched off project-wide (see
// agent/tools/web_search.ts and web_fetch.ts): search is served by
// firecrawl_search / exa_search and page reading by firecrawl_scrape.
export default defineAgent({
  description:
    "Investigate ONE self-contained research sub-question in depth using firecrawl_search, exa_search, firecrawl_scrape, x_search, and reddit_search. Returns a tight Markdown brief with inline source-URL citations. For breadth, delegate independent sub-questions to several researcher calls at once, each with a specific, non-overlapping task.",
  model: chatModel(DEFAULT_CHAT_MODEL),
  // CPA models carry no gateway metadata; provide the window so eve skips its
  // build-time catalog lookup (same hatch as agent.ts).
  modelContextWindowTokens: 200_000,
})
