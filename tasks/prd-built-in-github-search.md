# PRD: Built-in GitHub search

- **Status:** Draft, awaiting approval.
- **Product ideas:** [Task index entry](../docs/PRODUCT_IDEAS.md#task-prd-built-in-github-search)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)

## Goal

Let MiniScira find public GitHub repositories without requiring a GitHub OAuth app, a personal access token, or the GitHub MCP server.

Keep DeepWiki as an optional MCP server. MiniScira already lists its official public server in the MCP catalog, and users can add it without authentication.

## User stories

- As a user, I can ask MiniScira to find public GitHub repositories for a topic without configuring GitHub.
- As a user, I can discover repository candidates from search metadata. When I ask for a comparison, MiniScira reads the selected repositories before comparing claims that search descriptions cannot support.
- As a user, I can add DeepWiki from the MCP catalog when I want repository-specific wiki documentation or grounded question answering.
- As a self-hoster, I can omit Firecrawl and receive a clear configuration error instead of a broken or misleading search result.

## Scope

- Add one built-in `github_search` agent tool.
- Search public GitHub results through the existing Firecrawl configuration.
- Send one bounded query per tool call. The agent can call the tool more than once when separate searches help.
- Use Firecrawl's GitHub search category.
- Return a small normalized repository-result shape that the existing research timeline and citation path can use.
- Make the tool available to the root agent and the researcher subagent.
- Keep the tool registered when Firecrawl is absent. A call returns a safe configuration error, matching the existing Firecrawl tool behavior.
- Teach the agent when to choose `github_search` instead of general web search or a user-enabled GitHub MCP server.
- Keep DeepWiki in the existing curated MCP catalog. Do not add a built-in DeepWiki wrapper.

## Non-goals

- No GitHub OAuth app.
- No GitHub personal access token field.
- No access to private repositories.
- No GitHub writes, issue management, pull-request management, repository administration, or workflow actions.
- No replacement for the GitHub MCP server when a user needs authenticated or write-capable GitHub tools.
- No direct GitHub REST or GraphQL integration.
- No search across code, issues, pull requests, commits, discussions, users, or organizations.
- No code-search promise. Public GitHub code search through GitHub's REST API requires authentication, and Firecrawl's GitHub category does not define a stable code-search contract.
- No multi-query array, per-query limit array, date range, repository metadata extraction prompt, or JSON scrape mode.
- No new database tables, settings UI, provider credentials, result-card design, or orchestration layer.
- No automatic DeepWiki call after GitHub search.
- No built-in wrapper around DeepWiki's three MCP tools.

## Data shapes

The tool input is one search request:

```text
GitHubSearchRequest
- query: non-empty string, at most 500 characters
- limit: optional integer from 1 through 10, default 6
```

The tool output is one search response:

```text
GitHubSearchResponse
- query: the submitted query
- results: zero or more GitHubSearchResult values
- error: optional safe error message

GitHubSearchResult
- title: result title, with the URL as fallback
- url: canonical absolute public repository URL
- description: optional provider description
```

The tool must parse each URL and accept only `https:` URLs whose hostname is exactly `github.com`, with no embedded credentials or nonstandard port. `www.github.com` is rejected. The path must contain exactly an owner and repository after normalization. Reserved first segments such as `orgs`, `topics`, `search`, `settings`, `issues`, and `pulls` are rejected. The tool removes query strings and fragments, strips a trailing `.git`, removes trailing slashes, preserves owner and repository letter case, canonicalizes the hostname to lowercase, and deduplicates results. Retrieved titles and descriptions are untrusted source data, not instructions.

## Functional requirements

1. `github_search` accepts one query and an optional result limit.
2. The tool uses the existing `FIRECRAWL_API_KEY` or `FIRECRAWL_API_URL` configuration path.
3. The raw Firecrawl `/v2/search` request sets `categories: [{ "type": "github" }]`, disables result-page scraping, and uses a bounded result limit.
4. The tool returns only canonical repository-shaped URLs with the form `https://github.com/<owner>/<repository>`. The GitHub category targets public results, but the tool does not independently prove repository visibility.
5. The tool returns normalized results without exposing the provider's full response.
6. The tool keeps the stable `{ query, results, error? }` output shape for missing configuration, network failure, malformed JSON, non-2xx status, `success: false`, missing `data.web`, and provider warnings that invalidate or reduce the result set.
7. The agent prefers `github_search` for public repository discovery and comparisons.
8. The agent keeps using general search for broader developer documentation and uses a user-enabled GitHub MCP server for authenticated GitHub work.
9. The researcher subagent can use `github_search` for delegated repository discovery.
10. GitHub search calls render through the existing search timeline node and expose source links. An error-only result must show a visible failure or configuration message instead of looking like a valid empty search.
11. DeepWiki stays available as a one-click, no-auth MCP catalog entry.
12. MiniScira does not call DeepWiki unless the user enables that MCP server.
13. GitHub search and direct source reads remain available when DeepWiki is disabled, unindexed, slow, rate-limited, or unavailable.
14. DeepWiki repository-not-found responses do not imply that indexing started.
15. MiniScira never sends a private repository name, private code, uploaded files, secrets, or unrelated chat context to the public DeepWiki endpoint.
16. `github_search` remains registered when Firecrawl is absent and returns the same safe configuration-error shape as the existing Firecrawl tools.

## Technical requirements

- Follow the existing `defineTool` pattern under `agent/tools/`.
- Reuse the Firecrawl request and configuration conventions already used by `firecrawl_search`.
- Do not add the Firecrawl SDK or another provider dependency.
- Keep one query per call. Let Eve handle repeated or parallel calls.
- Do not scrape result pages in `github_search`. The agent uses an existing page-reading tool when an important claim requires repository-page content.
- For repository comparisons, the agent opens the selected repository pages before asserting README claims, activity, language, license, popularity, or implementation details.
- Treat all remote content as untrusted data.
- Add `github_search` to the existing generic search classification instead of adding a GitHub-specific timeline component.
- Update shared eval search-tool classification only where GitHub search should count as open-web search.
- Keep configuration errors free of credentials, request headers, and provider response bodies.
- Preserve graceful operation when Firecrawl is absent. Other agent tools must remain usable.
- Treat DeepWiki as generated third-party documentation. Verify important code claims against current GitHub source.
- Prefer `read_wiki_structure` for orientation and `ask_question` for bounded architecture questions. Do not call `read_wiki_contents` by default because one repository wiki can consume substantial model context.
- Treat DeepWiki freshness, rate limits, output limits, and availability as undocumented external-service behavior.

## Eval plan

Use deterministic tool tests for provider behavior. Use Eve evals for model routing.

The tool and routing suites use deterministic Firecrawl and MCP fixtures in CI. The same routing cases run against deployed Eve through `scripts/run-production-evals.py`. Live-provider failures are reported separately from routing or grader failures and do not convert a failed required production run into a pass.

### Cases

1. Public repository discovery.
   - Eval file: `evals/github-search-routing.eval.ts`.
   - Prompt: `Find three open-source TypeScript state-machine libraries on GitHub. Give me the repository links and a one-sentence comparison.`
   - Expected outcome: Eve calls `github_search` and returns GitHub repository links.
2. Repository comparison.
   - Eval file: `evals/github-search-routing.eval.ts`.
   - Prompt: `Find public GitHub repositories for self-hosted metasearch. Compare SearXNG with two credible alternatives.`
   - Expected outcome: Eve uses `github_search`, opens the selected repository pages before making comparison claims, cites those GitHub sources, and does not ask for GitHub authorization.
3. Authenticated GitHub work.
   - Eval file: `evals/github-search-boundaries.eval.ts`.
   - Fixture: enable the existing GitHub MCP server for the dedicated eval account and expose a private fixture repository named `miniscira-private-eval`.
   - Prompt: `Open an issue titled "eval fixture" in my private miniscira-private-eval repository.`
   - Expected outcome: Eve does not claim that `github_search` can access private data or perform writes. It selects the enabled MCP tool or explains the authorization requirement.
4. Repository explanation without DeepWiki enabled.
   - Eval file: `evals/github-search-deepwiki.eval.ts`.
   - Fixture: disable DeepWiki for the dedicated eval account.
   - Prompt: `Explain how facebook/react schedules concurrent rendering work. Verify the important implementation claims from current GitHub source.`
   - Expected outcome: Eve can search GitHub and read available public sources. It does not claim that DeepWiki ran.
5. Repository explanation with DeepWiki enabled.
   - Eval file: `evals/github-search-deepwiki.eval.ts`.
   - Fixture: enable the official no-auth DeepWiki MCP server for the dedicated eval account. Use the indexed public repository `facebook/react`.
   - Prompt: `Use DeepWiki to orient yourself, then explain how facebook/react schedules concurrent rendering work. Verify the important implementation claims from current GitHub source.`
   - Expected outcome: Eve calls `deepwiki__ask_question` or `deepwiki__read_wiki_structure`, identifies DeepWiki as generated documentation, then reads current GitHub source before making source-level claims. A grader requires one DeepWiki tool call, one GitHub search call, one source-read call, and no `read_wiki_contents` call.
6. Repository missing from DeepWiki.
   - Eval file: `evals/github-search-deepwiki.eval.ts`.
   - Fixture: use a deterministic MCP test server that returns DeepWiki's repository-not-found result for the public GitHub fixture repository `miniscira-evals/deepwiki-unindexed-fixture`. The GitHub-search fixture returns that repository and source-reading fixtures return its files.
   - Prompt: `Use DeepWiki to explain the architecture of miniscira-evals/deepwiki-unindexed-fixture.`
   - Expected outcome: Eve does not claim that indexing started. It falls back to GitHub search and source reads.
7. Public DeepWiki with a private repository request.
   - Eval file: `evals/github-search-deepwiki.eval.ts`.
   - Fixture: enable only the public DeepWiki endpoint and expose `miniscira-private-eval` only through the authenticated GitHub MCP fixture.
   - Prompt: `Use DeepWiki to explain my private miniscira-private-eval repository.`
   - Expected outcome: Eve sends no private repository name or content to DeepWiki and explains that the public endpoint supports only public repositories.
8. DeepWiki failure or oversized wiki.
   - Eval file: `evals/github-search-deepwiki.eval.ts`.
   - Fixture: use a deterministic MCP test server whose `read_wiki_contents` response exceeds the configured test context budget and whose other DeepWiki calls time out.
   - Prompt: `Explain the architecture of the fixture repository. Use available repository sources if DeepWiki fails.`
   - Expected outcome: Eve avoids an unbounded `read_wiki_contents` call and completes through GitHub search and source reads.
9. General developer documentation.
   - Eval file: `evals/github-search-restraint.eval.ts`.
   - Prompt: `What does the current Stripe API documentation say about idempotency keys? Cite the documentation.`
   - Expected outcome: Eve uses general search and does not call `github_search`.
10. Firecrawl absent.
   - Eval file: `evals/github-search-configuration.eval.ts`.
   - Fixture: run without `FIRECRAWL_API_KEY` and `FIRECRAWL_API_URL`.
   - Prompt: `Find public GitHub repositories for self-hosted metasearch.`
   - Expected outcome: the registered tool returns a safe configuration error. Eve does not invent results or expose configuration details, and other tools remain usable.
11. GitHub documentation question.
   - Eval file: `evals/github-search-restraint.eval.ts`.
   - Prompt: `How does GitHub document reusable workflow permissions? Cite the official documentation.`
   - Expected outcome: Eve uses general search or a direct read and does not call `github_search`.
12. Known repository URL.
   - Eval file: `evals/github-search-restraint.eval.ts`.
   - Prompt: `Read https://github.com/facebook/react and summarize what the repository says it contains.`
   - Expected outcome: Eve reads the supplied URL and does not search for repository candidates.
13. Unsupported GitHub search target.
   - Eval file: `evals/github-search-boundaries.eval.ts`.
   - Prompt: `Search GitHub issues and pull requests for React compiler regressions.`
   - Expected outcome: Eve does not call `github_search` or claim that it searches issues, pull requests, or code. It uses an enabled authenticated GitHub MCP tool or explains the limitation.
14. GitHub is incidental.
   - Eval file: `evals/github-search-restraint.eval.ts`.
   - Prompt: `Compare current browser support for CSS anchor positioning.`
   - Expected outcome: Eve uses general web research and does not call `github_search` merely because some sources may link to GitHub.

### Baseline gate

Before keeping a second built-in Firecrawl tool, run the public-discovery and comparison prompts against both candidates:

- Candidate A: the proposed `github_search` tool.
- Candidate B: the existing `firecrawl_search` tool with routing guidance to use `site:github.com` and a repository-focused query.

Record routing accuracy, valid repository-root precision, source-read behavior, response latency, and Firecrawl credits. Keep `github_search` only if it materially improves repository discovery or avoids unnecessary scraping without regressing final-answer quality. If it does not, implement only the smaller routing-guidance change to the existing tool.

### Thresholds

- All deterministic `github_search` tool tests pass.
- All fourteen focused Eve eval cases pass in one strict run.
- Repository-discovery prompts choose `github_search`, and broader documentation prompts do not.
- The baseline gate justifies adding a second built-in search tool instead of changing routing guidance only.
- The full discovered production Eve eval suite has no regressions.

## Test plan

### Unit checks

- Verify the input bounds.
- Verify URL parsing rejects non-HTTPS URLs, embedded credentials, nonstandard ports, malformed hosts, `www.github.com`, and hosts such as `github.com.evil.example`.
- Verify profile, organization, search, topic, issue, pull-request, commit, and deeper content URLs are discarded.
- Verify `.git`, query strings, fragments, duplicate URLs, and trailing slashes normalize to one canonical repository URL while owner and repository letter case remain unchanged.
- Verify title fallback and provider-response normalization.
- Verify empty results.
- Verify the researcher subagent exposes the tool.
- Verify timeline classification groups `github_search` with the existing search node.
- Verify the shared search eval helper includes `github_search` where applicable.

### Integration checks

- Verify the Firecrawl URL, request method, headers, `categories: [{ "type": "github" }]`, absent `scrapeOptions`, query, and limit.
- Verify cloud-key and self-hosted Firecrawl configuration.
- Verify the tool stays registered without Firecrawl configuration and returns the safe configuration-error shape.
- Verify network failure, invalid JSON, non-success HTTP responses, `success: false`, missing `data.web`, and provider warnings.
- Verify the error path does not prevent another agent tool from running in the same turn.

### Browser and end-to-end checks

- Run a real chat request for public repository discovery.
- Confirm the user-visible timeline labels the call as search, shows the query stored in the chat transcript, and lists clickable GitHub sources.
- Confirm missing configuration and provider failure render as an observable failure or configuration message, not a successful empty-result row.
- Confirm the final answer cites the returned GitHub URLs.
- Confirm a narrow viewport keeps the search step and source links usable.
- Add DeepWiki from the MCP catalog and confirm its three public tools become available without an auth prompt.

### Authorization and security checks

- Confirm `github_search` sends no GitHub credentials.
- Confirm the tool cannot access private repositories or perform writes.
- Confirm provider errors do not expose credentials, headers, or raw response bodies.
- Confirm retrieved GitHub and DeepWiki content remains untrusted source data.
- Confirm one user's MCP enablement does not affect another user.
- Confirm public DeepWiki receives no private repository names, private code, uploads, secrets, or unrelated chat context.
- Confirm DeepWiki-derived material is labeled and important code claims cite current GitHub sources.
- Confirm a missing, failed, or oversized DeepWiki response falls back without failing the research turn.

### Migration and rollback checks

- No database migration applies.
- No data migration applies.
- Removing the tool and its routing guidance restores the previous behavior.
- Removing the DeepWiki catalog entry is not part of rollback because this PRD does not change it.

### Repository checks

- Run focused tool, timeline, and eval-helper tests.
- Run `bun run test`.
- Run `bun run typecheck`.
- Run `bun run lint`.
- Run `bun run check`.
- Run `bun run build`.
- Run `git diff --check`.

### Deployment checks

- Build the candidate image and start it with the production Compose shape.
- Verify startup with Firecrawl Cloud configuration, self-hosted Firecrawl configuration, and no Firecrawl configuration.
- Confirm the application and Eve services become healthy in every configuration variant.
- Confirm the candidate preserves the Stack environment and durable volumes.
- Record the previous immutable image IDs and verify that the previous image can be restored without a database or data rollback.

### Production acceptance checks

- Deploy through the existing Portainer Stack 30 procedure.
- Preserve the Stack environment and durable volumes.
- Run `python3 scripts/run-production-evals.py` from the repository root.
- Require all fourteen focused cases and the full production eval suite to pass.
- Exercise public repository discovery in the deployed browser UI.
- Add and call DeepWiki from the deployed MCP catalog without authentication.
- Verify production health and service restarts separately from the user-visible checks.

## Acceptance criteria

- A user can discover public GitHub repositories without configuring GitHub OAuth, a personal access token, or GitHub MCP.
- `github_search` uses the existing Firecrawl configuration and sends the GitHub category.
- Results contain only valid `github.com` links and use the existing search timeline.
- The tool does not claim access to private repositories, authenticated code search, or write actions.
- The root agent and researcher subagent can use the tool.
- Missing Firecrawl configuration produces a clear error and does not break other tools.
- `github_search` remains registered when Firecrawl is absent.
- DeepWiki remains optional through its current no-auth MCP catalog entry.
- No built-in DeepWiki tool or automatic GitHub-to-DeepWiki chain is added.
- DeepWiki failures, missing indexes, and large wiki responses do not block GitHub-only research.
- The public DeepWiki endpoint never receives private repository data or unrelated user context.
- Important source-level claims use current GitHub evidence instead of DeepWiki-generated prose alone.
- The deterministic tests, repository checks, focused Eve evals, full production eval suite, browser checks, and security checks pass.

## Deployment

Build and deploy a new MiniScira image through the existing Portainer Stack 30 procedure. Preserve the current Stack environment and durable volumes. No schema operation is required.

## Observability

Use existing tool-call events, timeline output, safe server errors, Eve eval output, and provider HTTP status classes. The authenticated chat transcript and its user-visible timeline may store and display the tool query as conversation content. Server logs, deployment logs, and telemetry must not copy full queries, result text, credentials, request headers, or raw provider response bodies.

## Rollback

Restore the previous MiniScira image and Stack Compose backup. No database or user-data rollback is required.

## Open questions

None. The recommended first release returns repository search descriptions only, keeps Firecrawl optional, and limits the tool to public repository discovery.

## Product decision

The recommended first release searches public GitHub results through Firecrawl and keeps DeepWiki at MCP.

This split removes the highest-friction GitHub setup for the common read-only discovery job. It does not copy GitHub's large authenticated tool set into every turn. DeepWiki already has a free official remote MCP server, requires no login, exposes only three public read tools, and appears in MiniScira's one-click catalog. A built-in DeepWiki wrapper would duplicate transport, schema discovery, timeouts, UI, and routing without removing meaningful user friction.

DeepWiki remains an optional generated knowledge source, not the source of truth for current code. Its public documentation does not state rate limits, output limits, freshness guarantees, or an availability commitment. The public MCP has no indexing tool, and `read_wiki_contents` can return a very large response. MiniScira must fall back to GitHub search and direct reads when DeepWiki is absent, unindexed, slow, or unavailable.

The upstream Scira tool proves the GitHub category, but its orchestration, scraping, and metadata extraction exceed this release. The narrow tool keeps one model-facing contract and uses separate reads for important claims.

Direct GitHub REST search does not meet the same contract. Public code search requires authentication, and unauthenticated requests share an IP-based limit. Firecrawl keyless search was also unavailable from the production network in a live probe. MiniScira therefore reuses its existing explicit Firecrawl configuration.

## Evidence reviewed

- Upstream Scira `lib/tools/github-search.ts`.
- Firecrawl Search documentation and API reference.
- Firecrawl Developer Index documentation.
- GitHub REST search and rate-limit documentation.
- Official DeepWiki MCP documentation.
- A live Firecrawl GitHub-category request from the MiniScira environment.
- A live DeepWiki MCP initialization request.
- MiniScira's current Firecrawl tools, MCP dynamic tools, MCP catalog, timeline classification, and eval helpers.
