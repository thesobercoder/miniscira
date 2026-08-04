// A catalog of public remote MCP servers (HTTP/SSE, no stdio) users can add in
// one click instead of hunting down endpoint URLs themselves. The curated set
// below is hand-verified against each vendor's docs; the rest are imported from
// the integrations.sh registry (see mcp-catalog-registry.ts).
import { MCP_CATALOG_REGISTRY } from "./mcp-catalog-registry"

export type McpAuthType = "none" | "header" | "oauth"

export type McpCatalogEntry = {
  slug: string
  name: string
  description: string
  url: string
  transport: "http" | "sse"
  authType: McpAuthType
  icon?: string
  headerKey?: string
  headerPlaceholder?: string
  learnMoreUrl: string
}

// Curated, hand-verified servers: exact header keys, docs links, and crisp
// brand marks. These come first and take precedence over the auto-generated
// registry import below (deduped by URL).
const CURATED_MCP_CATALOG: McpCatalogEntry[] = [
  {
    slug: "deepwiki",
    name: "DeepWiki",
    description:
      "Ask questions about any public GitHub repo's auto-generated wiki.",
    url: "https://mcp.deepwiki.com/mcp",
    transport: "http",
    authType: "none",
    learnMoreUrl: "https://mcp.deepwiki.com/",
  },
  {
    slug: "cloudflare-docs",
    name: "Cloudflare Docs",
    description: "Search Cloudflare's developer docs without leaving the chat.",
    url: "https://docs.mcp.cloudflare.com/mcp",
    transport: "http",
    authType: "none",
    icon: "https://svgl.app/library/cloudflare.svg",
    learnMoreUrl:
      "https://developers.cloudflare.com/agents/guides/connect-mcp-client/",
  },
  {
    slug: "semgrep",
    name: "Semgrep",
    description:
      "Scan code for security bugs with Semgrep — no account needed.",
    url: "https://mcp.semgrep.ai/mcp",
    transport: "http",
    authType: "none",
    learnMoreUrl: "https://semgrep.dev/docs/mcp",
  },
  {
    slug: "context7",
    name: "Context7",
    description: "Pull current docs and code examples for any library.",
    url: "https://mcp.context7.com/mcp",
    transport: "http",
    authType: "header",
    headerKey: "CONTEXT7_API_KEY",
    headerPlaceholder: "your key",
    learnMoreUrl: "https://context7.com/dashboard",
  },
  {
    slug: "exa",
    name: "Exa",
    description: "Neural web search built for agents, not keyword matching.",
    url: "https://mcp.exa.ai/mcp",
    transport: "http",
    authType: "header",
    headerKey: "x-api-key",
    headerPlaceholder: "your key",
    learnMoreUrl: "https://dashboard.exa.ai/",
  },
  {
    slug: "huggingface",
    name: "Hugging Face",
    description: "Look up models, datasets, and Spaces on the Hub.",
    url: "https://huggingface.co/mcp",
    transport: "http",
    authType: "header",
    headerKey: "Authorization",
    headerPlaceholder: "Bearer hf_...",
    learnMoreUrl: "https://huggingface.co/settings/tokens",
  },
  {
    slug: "github",
    name: "GitHub",
    description: "Search code, issues, and pull requests across your repos.",
    url: "https://api.githubcopilot.com/mcp/",
    transport: "http",
    authType: "header",
    icon: "https://svgl.app/library/github_light.svg",
    headerKey: "Authorization",
    headerPlaceholder: "Bearer <personal access token>",
    learnMoreUrl: "https://github.com/settings/tokens",
  },
  {
    slug: "stripe",
    name: "Stripe",
    description:
      "Look up charges, customers, and subscriptions with a restricted key.",
    url: "https://mcp.stripe.com",
    transport: "http",
    authType: "header",
    icon: "https://svgl.app/library/stripe.svg",
    headerKey: "Authorization",
    headerPlaceholder: "Bearer rk_...",
    learnMoreUrl: "https://docs.stripe.com/mcp",
  },
  {
    slug: "zapier",
    name: "Zapier",
    description: "Trigger any Zap or connected app right from a chat.",
    url: "https://mcp.zapier.com/api/v1/connect",
    transport: "http",
    authType: "header",
    headerKey: "Authorization",
    headerPlaceholder: "Bearer <token from mcp.zapier.com>",
    learnMoreUrl: "https://mcp.zapier.com",
  },
  {
    slug: "linear",
    name: "Linear",
    description: "Read and update Linear issues, projects, and cycles.",
    url: "https://mcp.linear.app/mcp",
    transport: "http",
    authType: "oauth",
    icon: "https://svgl.app/library/linear.svg",
    learnMoreUrl: "https://linear.app/docs/mcp",
  },
  {
    slug: "notion",
    name: "Notion",
    description: "Search and edit pages and databases in your workspace.",
    url: "https://mcp.notion.com/mcp",
    transport: "http",
    authType: "oauth",
    icon: "https://svgl.app/library/notion.svg",
    learnMoreUrl:
      "https://developers.notion.com/guides/mcp/get-started-with-mcp",
  },
  {
    slug: "atlassian",
    name: "Atlassian",
    description: "Work with Jira issues and Confluence pages.",
    url: "https://mcp.atlassian.com/v1/mcp",
    transport: "http",
    authType: "oauth",
    icon: "https://svgl.app/library/atlassian.svg",
    learnMoreUrl: "https://support.atlassian.com/atlassian-rovo-mcp-server/",
  },
  {
    slug: "sentry",
    name: "Sentry",
    description: "Pull stack traces and issue context straight from Sentry.",
    url: "https://mcp.sentry.dev/mcp",
    transport: "http",
    authType: "oauth",
    icon: "https://svgl.app/library/sentry.svg",
    learnMoreUrl: "https://docs.sentry.io/product/sentry-mcp/",
  },
  {
    slug: "neon",
    name: "Neon",
    description: "Query and manage your Neon Postgres branches.",
    url: "https://mcp.neon.tech/mcp",
    transport: "http",
    authType: "oauth",
    icon: "https://svgl.app/library/neon.svg",
    learnMoreUrl: "https://neon.com/docs/ai/neon-mcp-server",
  },
  {
    slug: "webflow",
    name: "Webflow",
    description: "Edit CMS content and pages on your Webflow sites.",
    url: "https://mcp.webflow.com/mcp",
    transport: "http",
    authType: "oauth",
    icon: "https://svgl.app/library/webflow.svg",
    learnMoreUrl:
      "https://developers.webflow.com/mcp/reference/getting-started",
  },
  {
    slug: "paypal",
    name: "PayPal",
    description:
      "Look up transactions, invoices, and subscriptions with an access token.",
    url: "https://mcp.paypal.com/http",
    transport: "http",
    authType: "header",
    icon: "https://svgl.app/library/paypal.svg",
    headerKey: "Authorization",
    headerPlaceholder: "Bearer <access token>",
    learnMoreUrl: "https://docs.paypal.ai/developer/tools/ai/mcp-quickstart",
  },
  {
    slug: "fireflies",
    name: "Fireflies",
    description:
      "Search transcripts and summaries from your recorded meetings.",
    url: "https://api.fireflies.ai/mcp",
    transport: "http",
    authType: "header",
    headerKey: "Authorization",
    headerPlaceholder: "Bearer <API key from Settings → Developer>",
    learnMoreUrl: "https://docs.fireflies.ai/getting-started/mcp-configuration",
  },
  {
    slug: "hubspot",
    name: "HubSpot",
    description: "Look up and update contacts, deals, and tickets in your CRM.",
    url: "https://mcp.hubspot.com",
    transport: "http",
    authType: "oauth",
    learnMoreUrl: "https://developers.hubspot.com/mcp",
  },
  {
    slug: "intercom",
    name: "Intercom",
    description:
      "Search conversations and contacts from your Intercom workspace.",
    url: "https://mcp.intercom.com/mcp",
    transport: "http",
    authType: "header",
    headerKey: "Authorization",
    headerPlaceholder: "Bearer <access token from Developer Hub>",
    learnMoreUrl: "https://developers.intercom.com/docs/guides/mcp",
  },
  {
    slug: "airtable",
    name: "Airtable",
    description: "Read and write records across your Airtable bases.",
    url: "https://mcp.airtable.com/mcp",
    transport: "http",
    authType: "header",
    headerKey: "Authorization",
    headerPlaceholder: "Bearer <personal access token>",
    learnMoreUrl:
      "https://airtable.com/developers/web/guides/personal-access-tokens",
  },
  {
    slug: "supabase",
    name: "Supabase",
    description:
      "Query and manage your Supabase projects and Postgres databases.",
    url: "https://mcp.supabase.com/mcp",
    transport: "http",
    authType: "oauth",
    icon: "https://svgl.app/library/supabase.svg",
    learnMoreUrl: "https://supabase.com/docs/guides/getting-started/mcp",
  },
]

// The full catalog: curated first, then every generic-compatible server the
// integrations.sh registry has a live-detected endpoint for (deduped by URL).
export const MCP_CATALOG: McpCatalogEntry[] = [
  ...CURATED_MCP_CATALOG,
  ...MCP_CATALOG_REGISTRY.filter(
    (r) => !CURATED_MCP_CATALOG.some((c) => c.url === r.url)
  ),
]

/** Brand icon for a saved server, matched to the catalog by endpoint URL. */
export function catalogIconForUrl(url: string): string | undefined {
  return MCP_CATALOG.find((e) => e.url === url)?.icon
}
