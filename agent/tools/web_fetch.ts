import { disableTool } from "eve/tools"

/**
 * Removes eve's built-in `web_fetch`.
 *
 * The slug of this file is what selects the framework tool to drop — renaming
 * the file silently re-enables it.
 *
 * Page reading is served by `firecrawl_scrape`, which returns cleaned Markdown
 * and handles JS-rendered pages the plain fetcher returns empty. `firecrawl_map`
 * covers site discovery.
 */
export default disableTool()
