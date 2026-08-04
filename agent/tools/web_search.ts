import { disableTool } from "eve/tools"

/**
 * Removes eve's built-in `web_search`.
 *
 * The slug of this file is what selects the framework tool to drop — renaming
 * the file silently re-enables it.
 *
 * Search is served by `exa_search` (neural/keyword web search with content
 * extraction) plus the domain-specific `x_search` and `reddit_search`. Leaving
 * the framework default alongside them gave the model two general-purpose search
 * tools with overlapping descriptions and no stated reason to prefer either.
 */
export default disableTool()
