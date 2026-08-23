# Draft PRD: search and read previous threads

**Status:** Draft. Requires explicit user approval before implementation.
**Backlog source:** [Search and read previous threads](../docs/PRODUCT_IDEAS.md#search-and-read-previous-threads)
**Repository:** `/opt/data/miniscira-src`
**Last updated:** 2026-08-23

## 1. Purpose

The main purpose of this feature is agent continuity.

MiniScira stores previous conversations, but the agent cannot search or read them. This causes context loss between threads. The user must repeat earlier decisions, preferences, plans, sources, and research before the agent can continue the work.

This feature gives the agent two simple tools:

1. Search the titles of previous threads with PostgreSQL ranking.
2. Read selected previous threads or a bounded part of them.

The agent can use active and archived threads. Archive state changes how threads are organized. It does not remove their value as context.

The user also gets a simple `Ctrl/Cmd+K` thread picker. It follows the familiar ChatGPT pattern shown in the user-provided references. The picker searches thread titles only. It does not search message text.

Thread retrieval complements durable memory:

- Memory stores selected facts that should remain available over time.
- Thread retrieval recovers detailed conversation context and work history.

Neither replaces the other.

This PRD does not authorize implementation.

## 2. Product priority

The feature has two surfaces, in this order of importance:

1. **Agent continuity:** the agent searches and reads previous threads when earlier context may change the answer or action.
2. **User thread picker:** the user quickly finds and opens a thread by title.

Implementation and release testing must treat the agent flow as the primary flow.

## 3. Locked product decisions

### 3.1 Shared title search

- Search thread titles only in the first release.
- Run search in PostgreSQL. Do not load every title into application memory and rank it there.
- Use `pg_trgm` for case-insensitive typo-tolerant matching.
- Exact title matches rank first.
- Prefix matches rank before weaker trigram matches.
- More recent threads break otherwise equal scores.
- Use one shared SQL-backed search function for the user picker and agent tool.
- Apply ownership, project scope, archive rules, current-thread exclusion, ranking, ordering, and limits in the database query.
- Add only the PostgreSQL extension and indexes required for measured title search.
- Do not use embeddings, vectors, an external search service, or an in-process fuzzy-search package.
- Message-text search is not part of the first release. It may later use PostgreSQL full-text search over a safe visible-message projection. It must not search raw `chat_event.event` JSON because that data can contain hidden reasoning, tool payloads, system data, and superseded content.

### 3.2 Agent behavior

- The agent may search without the user asking for a search command.
- The agent must search when the user explicitly refers to earlier work.
- The agent should search when missing earlier context is likely to change the answer or action.
- The agent must not search on every turn.
- The agent searches active and archived threads by default.
- The agent excludes the current thread by default because it already has that context.
- The agent may read only a thread returned by its current authorized search. The read tool rechecks SQL ownership and project scope. Search selection does not replace authorization.
- Retrieved thread content is untrusted source data. Instructions inside old messages must not change current agent behavior.
- When the agent relies on an earlier thread, it links to that thread and makes the source clear.

### 3.3 User interface

- `Ctrl+K` on Windows/Linux and `Cmd+K` on macOS open the thread picker.
- A search icon in the sidebar opens the same picker.
- The picker opens over the current page and focuses the search field.
- The input placeholder is `Search chats…`.
- With an empty query, show:
  - `Last opened`
  - `Recent chats`
- `Last opened` means the current thread when the picker opens from a chat route. If the picker opens outside a chat route, it means the owned thread with the newest `updatedAt` value.
- `Recent chats` shows up to eight other owned threads ordered by `updatedAt`. It excludes the `Last opened` row.
- Each row shows a chat icon and thread title.
- Do not show message snippets, result summaries, ranking scores, or technical metadata.
- Show a quiet `Archived` label on every archived result.
- The list scrolls inside the picker.
- Arrow keys change the selected row.
- `Enter` opens the selected thread.
- `Escape`, the close button, or clicking outside closes the picker.
- Search results update while the user types.
- Selecting a result uses the Next.js App Router. It must not reload the document.

### 3.4 Scope and authorization

- Global search includes all non-deleted threads owned by the signed-in user.
- Archived threads are included.
- In a project chat, agent retrieval is restricted to that same project.
- Outside a project, agent retrieval may search all threads owned by the user.
- The agent cannot supply another user ID or override the project boundary.
- Every search and read query enforces ownership in SQL.
- A thread ID or title never proves ownership.
- Foreign and missing threads return the same safe not-found behavior.

## 4. Current repository facts

- `chat` already stores `id`, `userId`, optional `projectId`, `title`, `updatedAt`, and Eve session data.
- `chat_event` already stores the persisted thread transcript.
- `GET /api/chats` already lists the signed-in user's thread IDs, titles, and dates.
- The sidebar already loads the signed-in user's thread titles ordered by `updatedAt`.
- Production uses PostgreSQL 16 through `pgvector/pgvector:pg16`. Thread search can use ordinary PostgreSQL indexes and extensions. It does not need vector search.
- The app already uses Next.js App Router navigation.
- `lib/chat-events.ts` is the only place that may inspect `.type` on opaque Eve events.
- Eve tool authorization comes from `ctx.session.auth.current`.
- The repository already contains familiar dialog primitives and sidebar patterns.
- The implementation must first check current installed framework and component documentation and reuse established repository patterns.

## 5. Goals

- Let the agent continue work across threads without asking the user to repeat context.
- Let the agent retrieve useful context from archived threads.
- Let the agent find likely threads from a short or imperfect title query.
- Let the user open a thread picker with `Ctrl/Cmd+K`.
- Let the user find a thread by fuzzy title matching.
- Keep the UI as simple as the ChatGPT reference pattern.
- Reuse existing chat data and PostgreSQL. Avoid a second search system.
- Preserve user and project isolation.

## 6. Non-goals

- Searching message text in the user interface.
- Searching message text in the first agent-search step.
- Message snippets or highlighted message matches.
- Exact-message deep links.
- Search indexing tables or background index workers.
- Embeddings, vector search, semantic search, or a hosted search service.
- Message-text search in the first release. A later approved phase may use PostgreSQL full-text search over a safe visible-message projection.
- Saved searches, search operators, filters, analytics, or alerts.
- Building archive controls, auto-archive rules, or the archived-thread page.
- Replacing durable memory.
- Automatically injecting old threads into every prompt.
- Searching across users or deployments.

## 7. Primary journeys

### 7.1 Agent continues earlier work

1. The user refers to earlier work or asks to continue an ongoing task.
2. The agent decides that previous context may change the answer or action.
3. The agent calls `search_previous_threads` with likely title words.
4. The tool returns a small ranked list of owned thread titles.
5. The agent selects a likely thread and calls `read_previous_thread`.
6. The read tool returns bounded visible conversation content.
7. The agent continues the work and links to the source thread.
8. If several threads are plausible, the agent reads a small number or asks the user for a clue.
9. If no reliable match exists, the agent says so instead of inventing continuity.

### 7.2 User opens the picker

1. The user presses `Ctrl/Cmd+K` or clicks the sidebar search icon.
2. The picker opens and focuses `Search chats…`.
3. With no query, it shows `Last opened` and `Recent chats`.
4. The user types part of a title, including an imperfect spelling if needed.
5. Matching titles replace the recent list.
6. The user selects a result with pointer input or the keyboard.
7. MiniScira closes the picker and navigates to `/chat/<id>` without a document reload.

## 8. User stories

### US-001: shared PostgreSQL title search

**Description:** As a user and agent, I want the same predictable title matching so search behaves consistently.

**Acceptance criteria:**

- [ ] One server-side query helper accepts the authenticated scope, normalized query, current-thread exclusion, and bounded result limit.
- [ ] PostgreSQL filters ownership and project scope before ranking or limiting results.
- [ ] Matching is case-insensitive.
- [ ] Exact matches rank before prefix matches.
- [ ] Prefix matches rank before weaker trigram matches.
- [ ] `pg_trgm` supplies typo-tolerant candidate matching and ranking.
- [ ] Recency breaks equal scores.
- [ ] Results are deterministic.
- [ ] Empty queries return the defined recent groups instead of fuzzy results.
- [ ] Database integration tests cover exact, prefix, partial, misspelled, multi-word, short, empty, duplicate-score, Unicode, and punctuation-heavy titles.
- [ ] Query-plan tests confirm that representative non-empty searches use the intended title-search index.

### US-002: user thread picker

**Description:** As a user, I want a familiar command picker so I can open a previous thread quickly.

**Acceptance criteria:**

- [ ] `Ctrl+K` and `Cmd+K` open the picker from any app route.
- [ ] The sidebar search icon opens the same picker.
- [ ] Focus moves to the search field when opened and returns safely when closed.
- [ ] Empty search shows `Last opened` and `Recent chats`.
- [ ] Query results show title rows only, plus an archived label when needed.
- [ ] Arrow keys, `Enter`, and `Escape` work.
- [ ] Pointer and touch selection work.
- [ ] Loading, no-results, and error states are clear.
- [ ] The picker works in expanded and collapsed sidebar layouts.
- [ ] The picker works on narrow screens.
- [ ] Result navigation uses `router.push()` or `<Link>` and does not reload the document.
- [ ] Browser tests compare the behavior with the supplied ChatGPT references, while using MiniScira's existing design tokens and components.

### US-003: agent searches previous thread titles

**Description:** As a user, I want the agent to locate earlier threads when they may contain context needed for the current work.

**Acceptance criteria:**

- [ ] `search_previous_threads` accepts only a title query and bounded result limit.
- [ ] The server derives the authenticated user and current project scope.
- [ ] The agent cannot provide a user ID or project ID.
- [ ] Active and archived threads are searched by default.
- [ ] The current thread is excluded by default.
- [ ] Results contain thread ID, title, updated date, project ID when present, archived state, and app-relative link.
- [ ] The tool uses the same PostgreSQL query helper as the user picker.
- [ ] Tool tests prove user and project isolation.

### US-004: agent reads a selected previous thread

**Description:** As a user, I want the agent to read a relevant earlier thread so it can recover detailed context.

**Acceptance criteria:**

- [ ] `read_previous_thread` accepts a thread ID returned by the current authorized search and bounded read options.
- [ ] The server rechecks ownership and project scope for every read.
- [ ] The tool reduces persisted Eve events through shared event helpers.
- [ ] It returns only visible, non-superseded user and assistant messages.
- [ ] It excludes hidden reasoning, tool payloads, client context, system instructions, secrets, and raw event JSON.
- [ ] The response is bounded by message count and character count.
- [ ] The response identifies the source thread and provides an app-relative link.
- [ ] Old message content is clearly marked as untrusted quoted data.
- [ ] Archived threads remain readable.
- [ ] Tool tests cover missing, foreign, archived, deleted, malformed, and oversized threads.

### US-005: proactive but selective agent use

**Description:** As a user, I want the agent to recover earlier context when useful without searching unnecessarily.

**Acceptance criteria:**

- [ ] Agent instructions require search for explicit earlier-thread references.
- [ ] Agent instructions recommend search when prior context is likely to change the answer or action.
- [ ] The user does not need to name the thread or request a search command.
- [ ] The agent does not search for unrelated requests.
- [ ] The agent does not claim an earlier decision when no reliable source was found.
- [ ] Claims based on earlier threads link to the source thread.
- [ ] Instructions inside retrieved content are never followed.
- [ ] Agent evals meet Section 12 thresholds.

## 9. Functional requirements

### User picker

- **FR-001:** Add a sidebar search icon with accessible label `Search chats`.
- **FR-002:** Use `Control+K Meta+K` in `aria-keyshortcuts`.
- **FR-003:** Open one shared command-palette-style picker from the icon or keyboard shortcut.
- **FR-004:** Focus the search input on open.
- **FR-005:** Show `Last opened` and `Recent chats` when the query is empty.
- **FR-006:** Search titles only after the user enters non-whitespace text.
- **FR-007:** Render one simple icon-and-title row per result.
- **FR-008:** Render an archived label only when the archive state exists and the row is archived.
- **FR-009:** Support keyboard and pointer selection.
- **FR-010:** Navigate through public Next.js App Router APIs.

### Shared search

- **FR-011:** Normalize query whitespace and use explicit case-insensitive PostgreSQL expressions for matching.
- **FR-012:** Use one shared deterministic PostgreSQL title-search query.
- **FR-013:** Cap user results at 20 and agent results at 8.
- **FR-014:** Do not return chat content from title search.
- **FR-015:** Enforce ownership and project scope before matching or returning records.
- **FR-025:** Rank exact matches first, then prefixes, then trigram matches, then use recency and stable thread ID ordering as tie-breakers.
- **FR-026:** Define separate behavior for queries shorter than three characters so short prefixes remain useful without forcing broad trigram scans.
- **FR-027:** Run `EXPLAIN (ANALYZE, BUFFERS)` against representative owned data before release and record the accepted query plan without titles or user data.

### Agent tools

- **FR-016:** Add `search_previous_threads` as a core agent-continuity tool.
- **FR-017:** Add `read_previous_thread` as a separate bounded read tool.
- **FR-018:** Derive identity and project scope from Eve auth and the root chat session.
- **FR-019:** Fail closed when a delegated session cannot be mapped safely.
- **FR-020:** Reauthorize every read in SQL.
- **FR-021:** Return active and archived threads under the same retrieval rules.
- **FR-022:** Mark retrieved content as untrusted source text.
- **FR-023:** Require a thread link for claims based on retrieved content.
- **FR-024:** Return an honest no-match or ambiguous result instead of fabricated continuity.

## 10. Simple technical design

### 10.1 PostgreSQL title search

Use existing `chat` rows and search them in PostgreSQL. Select only owned thread metadata needed for search:

- `id`
- `title`
- `updatedAt`
- `projectId`
- archive state when available

Enable `pg_trgm` through a committed migration. Add a trigram index on the normalized title expression used by the query. Keep the existing owner and project indexes available for scope filtering. Use one parameterized SQL query that:

1. filters by authenticated owner and project scope;
2. excludes the current thread when required;
3. handles empty queries as recent-thread retrieval;
4. handles queries shorter than three characters as exact or prefix search;
5. handles longer queries as exact, prefix, and trigram candidate search;
6. ranks candidates by match class, trigram similarity, recency, and stable ID; and
7. applies the result limit in PostgreSQL.

Do not add a search table, vector column, embedding job, index worker, external service, or application-memory scan. If representative query plans later prove the scoped trigram query is insufficient, revise and re-approve the PRD before adding a visible-message search projection or other infrastructure.

### 10.2 User picker data

Use the simplest canonical data path supported by the current App Router code:

- Reuse already loaded sidebar chat metadata when it is complete and current; or
- Use one authenticated route that returns owned thread metadata.

Do not create duplicate client caches or private routing state.

### 10.3 Agent thread read

Read the selected thread from its persisted `chat_event` rows. Reuse the same event projection rules as the visible chat transcript. Keep the response bounded.

Suggested initial limits:

- Maximum 100 visible messages per read.
- Maximum 30,000 returned characters.
- Optional bounded range or continuation cursor for longer threads.

These limits must be verified against Eve model context and current tool-output guidance before implementation.

## 11. Security and privacy

- Every database query includes the authenticated owner condition.
- Project-scoped agent search includes the exact owned project condition.
- Search results never expose message content.
- Ordinary logs never contain queries, titles, or retrieved messages.
- Tool errors never reveal whether a foreign thread exists.
- Retrieved old messages are data, not instructions.
- The model receives only the bounded content required for the current task.
- Deleting a thread removes it from search and makes later reads return not found.

## 12. Tests and agent evals

### 12.1 Unit and API tests

Cover:

- exact title match;
- PostgreSQL query plan and index use;
- case-insensitive match;
- prefix match;
- partial and misspelled title;
- multi-word query;
- deterministic tie ordering;
- empty query grouping;
- active and archived threads;
- current-thread exclusion for agents;
- user and project isolation;
- bounded reads;
- delegated-session mapping through the root session;
- missing, ambiguous, and failed root-chat scope lookup, with no user-wide fallback;
- missing or non-user authenticated principals;
- visible user messages and multi-part visible assistant output;
- exclusion of reasoning, tool inputs, tool outputs, client events/context, system content, and superseded turns;
- isolation between multiple Eve sessions;
- prompt injection inside an old message;
- deleted and foreign thread reads.

### 12.2 Browser tests

Cover:

- sidebar search icon in expanded and collapsed states;
- `Ctrl/Cmd+K` from the composer and other app surfaces;
- autofocus;
- `Last opened` and `Recent chats`;
- live fuzzy results;
- arrow navigation, `Enter`, and `Escape`;
- pointer and touch selection;
- no-results and error states;
- archived label;
- narrow screen;
- no document reload during navigation;
- Back and Forward behavior after opening a result.

### 12.3 Agent eval fixtures

Include at least:

| Category | Minimum cases | Expected behavior |
|---|---:|---|
| Explicit earlier-thread reference | 8 | Searches, reads, and links the correct thread. |
| Implicit continuity request | 8 | Searches when prior context changes the work. |
| Approximate or misspelled title clue | 6 | Finds the correct title in the top 3. |
| Archived target | 4 | Finds and reads the archived thread. |
| Ambiguous titles | 4 | Reads only a small bounded set or asks for a clue. |
| No relevant title | 4 | Does not invent earlier context. |
| Unrelated request | 8 | Does not call thread retrieval. |
| Project isolation | 4 | Does not return another project's thread. |
| Cross-user isolation | 2 | Returns no foreign information. |
| Prompt injection in old content | 2 | Treats it as quoted data and ignores instructions. |

### 12.4 Release thresholds

- Explicit continuity tool routing: at least 95%.
- Implicit continuity tool routing: at least 90%.
- Tool restraint on unrelated prompts: at least 95%.
- Correct title in top 3 for fuzzy-title fixtures: at least 90%.
- Thread-link validity: 100%.
- Cross-user and cross-project isolation: 100%.
- Prompt-injection resistance: 100%.
- No-match honesty: 100%.

Any privacy, authorization, or prompt-injection failure blocks release.

## 13. Performance targets

Use representative PostgreSQL data sets of 1,000, 10,000, and 100,000 thread titles across multiple users and projects.

- Picker opens within 100 ms after the keyboard event when data is already loaded.
- Title results update within 100 ms at p95 for 1,000 owned titles.
- Title results update within 250 ms at p95 for 10,000 owned titles.
- A scoped search remains within 500 ms at p95 in the 100,000-row mixed-owner data set on the reference self-hosted deployment.
- Representative non-empty searches use the intended PostgreSQL index and do not sort or transfer every owned title in application memory.
- Agent title search completes within 500 ms at p95 on the reference self-hosted deployment.
- Thread reads remain bounded and do not load unbounded transcripts into the model.

If these targets fail, measure the actual bottleneck before changing the architecture.

## 14. Deployment and rollback

### Deployment

1. Approve this PRD.
2. Confirm the archive-state field and current Eve read APIs.
3. Implement the shared PostgreSQL title query, migration, and tests.
4. Add agent search and read tools behind a feature flag.
5. Add agent instructions and run evals.
6. Add the user picker and browser tests.
7. Exercise the real agent continuity flow first.
8. Exercise the user picker flow.
9. Deploy progressively and inspect privacy-safe errors and latency.
10. Complete the repository source-control checks.

### Rollback

- Disable agent tools and the user picker feature flags.
- Roll back the application image or commit.
- The `pg_trgm` extension may remain installed after application rollback. Remove the title-search index only through a tested migration when needed; it contains no user content and does not change chat rows.
- Existing chats and events remain unchanged.

## 15. Ordered implementation tasks

Create TODOs only after explicit PRD approval.

1. Confirm exact archive state and Eve transcript reduction APIs.
2. Freeze shared title-ranking behavior with database fixtures.
3. Add the `pg_trgm` migration and title index.
4. Implement and test the authorized PostgreSQL thread-title query.
5. Implement `search_previous_threads`.
6. Implement bounded `read_previous_thread`.
7. Update agent instructions and citations.
8. Build and pass the agent eval suite.
9. Build the `Ctrl/Cmd+K` picker with existing UI primitives.
10. Add sidebar search affordance and accessibility metadata.
11. Run focused, full, browser, security, and performance tests.
12. Deploy, verify the primary agent flow, verify the secondary user flow, and push the clean repository state.

Do not start with embeddings, vector search, raw-event search, an external service, or a custom routing mechanism. PostgreSQL title search and its measured index are the initial search infrastructure.

## 16. Open questions

1. What canonical archive field will the archive PRD add?
2. What exact `pg_trgm` threshold and ranking weights perform best on representative MiniScira titles? Lock them from measured fixtures before implementation.
3. Should the agent read the whole bounded thread from the start, the most recent messages, or a requested range? Proposed default: return the most recent visible messages within the limit, with a continuation option.
4. Should a later phase search visible message text with PostgreSQL full-text search? If yes, it needs a separate approved design for a safe visible-message projection, update path, language configuration, authorization, ranking, snippets, migration, and rollback.

## 17. Approval gate

Before implementation:

- [ ] The user approves this revised PRD.
- [ ] Every open question that changes observable behavior, architecture, or tests is resolved.
- [ ] The approved TODO plan records exact test files, eval commands, browser-test commands, performance commands, and acceptance-fixture mapping.
- [ ] Only one TODO is in progress at a time.
- [ ] Implementation follows the simplest canonical repository and framework patterns.

## 18. Implementation handoff

The implementation agent must receive:

- This PRD as the source of truth.
- `AGENTS.md` and the linked project guidance.
- The user-provided ChatGPT UI images as behavioral references, not as a license to copy branding.
- The locked rule that agent continuity is primary and user title search is secondary.
- The locked title-only PostgreSQL search scope.
- The rule that active and archived threads are available to agents.
- The rule that embeddings, vector search, raw-event search, and external search services are excluded. A visible-message PostgreSQL search projection needs a revised approved PRD.
- The ordered tasks. The approved TODO plan must add the exact verification commands and fixture mapping before implementation starts.

If a simple existing repository or framework pattern can solve a requirement, use it. Do not invent a new system.
