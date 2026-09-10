export const searchRoutingFixtures = [
  {
    name: "general",
    agent: "root",
    providers: "all",
    prompt:
      "Search the web for the current PostgreSQL release and cite its official release page.",
    expected: "firecrawl_search",
  },
  {
    name: "reddit",
    agent: "root",
    providers: "firecrawl",
    prompt:
      "Find Reddit discussions about self-hosted search tools. Cite the threads you find.",
    expected: "reddit_search",
  },
  {
    name: "exa-only",
    agent: "root",
    providers: "exa",
    prompt:
      "Search for an authoritative paper about retrieval augmented generation and cite it.",
    expected: "exa_search",
  },
  {
    name: "no-provider",
    agent: "root",
    providers: "none",
    prompt:
      "Search the web for today's PostgreSQL news. Tell me if live search is unavailable.",
    expected: null,
  },
  {
    name: "researcher",
    agent: "researcher",
    providers: "all",
    prompt:
      "Investigate the current PostgreSQL release using official sources. Return a brief with citations.",
    expected: "firecrawl_search",
  },
  {
    name: "deep-research",
    agent: "root",
    providers: "all",
    skill: "deep_research",
    prompt:
      "Research PostgreSQL's current release. Handle this one sub-question yourself and find official sources.",
    expected: "firecrawl_search",
  },
  {
    name: "comparison",
    agent: "root",
    providers: "all",
    skill: "compare_options",
    prompt:
      "Compare PostgreSQL and SQLite for a small self-hosted app. Research the PostgreSQL official documentation yourself for this turn.",
    expected: "firecrawl_search",
  },
] as const
