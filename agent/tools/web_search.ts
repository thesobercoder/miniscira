import { disableTool } from "eve/tools"

/**
 * Removes eve's built-in `web_search`.
 *
 * The slug of this file is what selects the framework tool to drop — renaming
 * the file silently re-enables it.
 *
 * Search is served by `firecrawl_search` by default (general web search with
 * content extraction), plus `firecrawl_scrape` (page reader) and
 * `firecrawl_map` (site mapping). `exa_search` remains as a fallback when
 * only its key is set, alongside the narrow `x_search` and `reddit_search`.
 * Leaving the framework default alongside them gave the model two
 * general-purpose search tools with overlapping descriptions and no stated
 * reason to prefer either.
 */
export default disableTool()
