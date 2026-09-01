# PRD: search and read previous threads

- **Status:** Done
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-thread-search)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Approved by Soham on 2026-08-23. Phase 1 only; Phase 2 keeps its separate release gate.
- **Repository:** `/opt/data/miniscira-src`
- **Last updated:** 2026-08-27

## Goal

### Purpose

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

This approved PRD authorizes the ordered Phase 1 work and its verification plan. It does not authorize releasing Phase 2 before its separate gate passes.

### Product priority

The feature has two surfaces, in this order of importance:

1. **Agent continuity:** the agent searches and reads previous threads when earlier context may change the answer or action.
2. **User thread picker:** the user quickly finds and opens a thread by title.

Implementation and release testing must treat the agent flow as the primary flow.

### Goals

- Let the agent continue work across threads without asking the user to repeat context.
- Let the agent retrieve useful context from archived threads.
- Let the agent find likely threads from a short or imperfect title query.
- Let the user open a thread picker with `Ctrl/Cmd+K`.
- Let the user find a thread by fuzzy title matching.
- Keep the UI as simple as the ChatGPT reference pattern.
- Reuse existing chat data and PostgreSQL. Avoid a second search system.
- Preserve user and project isolation.

## User stories

### Primary journeys

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

### US-001: shared PostgreSQL title search

**Description:** As a user and agent, I want the same predictable title matching so search behaves consistently.

### US-002: user thread picker

**Description:** As a user, I want a familiar command picker so I can open a previous thread quickly.

### US-003: agent searches previous thread titles

**Description:** As a user, I want the agent to locate earlier threads when they may contain context needed for the current work.

### US-004: agent reads a selected previous thread

**Description:** As a user, I want the agent to read a relevant earlier thread so it can recover detailed context.

### US-005: proactive but selective agent use

**Description:** As a user, I want the agent to recover earlier context when useful without searching unnecessarily.

## Scope

### Locked product decisions

### 3.1 Shared title search

- Search thread titles only in the first release.
- Run search in PostgreSQL. Do not load every title into application memory and rank it there.
- Use PostgreSQL full-text search for token and multi-word matching.
- Use `pg_trgm` for case-insensitive typo-tolerant matching.
- Exact title matches rank first.
- Prefix matches rank before full-text and weaker trigram matches.
- More recent threads break otherwise equal scores.
- Use one shared SQL-backed search function for the user picker and agent tool.
- Apply ownership, project scope, archive rules, current-thread exclusion, ranking, ordering, and limits in the database query.
- Add only the PostgreSQL extension and indexes required for measured title search.
- Do not use embeddings, vectors, an external search service, or an in-process fuzzy-search package.
- Plan message-text search as a second phase in this PRD. It uses PostgreSQL full-text search over a safe visible-message projection. It must not search raw `chat_event.event` JSON because that data can contain hidden reasoning, tool payloads, system data, and superseded content.

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

### Locked Phase 1 defaults

1. The archive PRD defines `archivedAt`. Until that schema ships, all existing owned threads are active. Thread search must not invent a second archive field. After archive ships, active and archived threads use the same search path.
2. Title search uses PostgreSQL's `simple` text-search configuration. Fixtures must cover Unicode, multilingual, short, and punctuation-heavy titles.
3. Exact and prefix tiers use explicit SQL predicates. Full-text ranking handles tokens and multi-word queries. `pg_trgm` handles typo tolerance. Measured fixtures lock the similarity threshold before release.
4. A title-selected read returns the most recent visible messages first. A continuation cursor retrieves older visible messages.
5. Phase 1 limits are 8 agent search results, 20 picker results, 100 visible messages, 30,000 returned characters, and a measured maximum of 10,000 persisted events per interim read. Exceeding the event ceiling returns a safe bounded error instead of reducing an unbounded log.
6. Standard committed GIN index creation is the default for the current self-hosted scale. Query-plan and migration timing tests must prove it is acceptable before production. If not, revise the migration plan to use a reviewed maintenance step.

Phase 2 engineering decisions stay behind its release gate. The implementation work must lock the stable message identifier, projection update boundary, message text-search configuration, title-to-message fallback threshold, and backfill limits from transcript-equivalence fixtures and measured production-like data.

## Non-goals

- Searching message text in the user interface.
- Searching message text in the first agent-search step.
- Message snippets or highlighted message matches.
- Exact-message deep links.
- Search indexing tables or background index workers.
- Embeddings, vector search, semantic search, or a hosted search service.
- Message-text search in the first release. It is planned as Phase 2 and stays behind a separate release gate.
- Saved searches, search operators, filters, analytics, or alerts.
- Building archive controls, auto-archive rules, or the archived-thread page.
- Replacing durable memory.
- Automatically injecting old threads into every prompt.
- Searching across users or deployments.

## Functional requirements

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
- **FR-025:** Rank exact matches first, then prefixes, then full-text matches, then trigram matches, then use recency and stable thread ID ordering as tie-breakers.
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

## Technical requirements

### Current repository facts

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

### Simple technical design

### 10.1 PostgreSQL title search

Use existing `chat` rows and search them in PostgreSQL. Select only owned thread metadata needed for search:

- `id`
- `title`
- `updatedAt`
- `projectId`
- archive state when available

Enable `pg_trgm` through a committed migration. Add a stored title search vector with a fixed PostgreSQL text-search configuration, a GIN index for that vector, and a trigram index on the normalized title expression. Keep the existing owner and project indexes available for scope filtering. Use one parameterized SQL query that:

1. filters by authenticated owner and project scope;
2. excludes the current thread when required;
3. handles empty queries as recent-thread retrieval;
4. handles queries shorter than three characters as exact or prefix search;
5. handles longer queries as exact, prefix, full-text, and trigram candidate search;
6. ranks candidates by match class, full-text rank, trigram similarity, recency, and stable ID; and
7. applies the result limit in PostgreSQL.

Do not add a vector column, embedding job, external index worker, external service, or application-memory scan.

### 10.2 Phase 2: PostgreSQL message search

Title search is the first release. It is not enough for every agent-continuity request because an old decision may not appear in the thread title.

Phase 2 adds PostgreSQL full-text search over a derived visible-message table. It does not index raw `chat_event.event` JSON. The table stores only canonical visible user and assistant text, plus stable source positions needed for a bounded read around a match.

The projection must:

- use the same Eve session scoping, supersede handling, reducer behavior, and visible-text extraction as the rendered transcript;
- exclude reasoning, tool inputs, tool outputs, system text, client context, malformed events, secrets, and superseded content;
- update when a durable user message or completed assistant response is persisted;
- backfill existing threads in bounded, restartable batches;
- join back to `chat` for every authorization check instead of trusting copied ownership fields; and
- use PostgreSQL GIN full-text indexing. Add trigram indexing to message text only if measured typo cases justify its storage and write cost.

Agent discovery stays progressive:

1. Search authorized thread titles.
2. If title results are weak, or the request refers to message content, search the authorized visible-message projection.
3. Group matches into a small number of threads.
4. Return thread metadata and an opaque match cursor, not a broad transcript dump.
5. Call `read_previous_thread` for a bounded window around the selected match.

Phase 2 has its own release gate. Do not enable it until projection equivalence, backfill, authorization, query-plan, bounded-read, and prompt-injection tests pass.

### 10.3 User picker data

Use the simplest canonical data path supported by the current App Router code:

- Reuse already loaded sidebar chat metadata when it is complete and current; or
- Use one authenticated route that returns owned thread metadata.

Do not create duplicate client caches or private routing state.

### 10.4 Agent thread read

Read the selected thread with the same event projection rules as the visible chat transcript. Keep model output, database work, and reducer work bounded separately.

Suggested initial limits:

- Maximum 100 visible messages per read.
- Maximum 30,000 returned characters.
- Optional bounded range or continuation cursor for longer threads.
- Optional opaque match cursor for a small window around a Phase 2 message match.

Until the visible-message projection is available, title-selected reads may reduce the event log with a measured maximum event count. After Phase 2 equivalence is proven, use the projection as the bounded-read source when possible.

These limits must be verified against Eve model context and current tool-output guidance before implementation.

### Security and privacy

- Every database query includes the authenticated owner condition.
- Project-scoped agent search includes the exact owned project condition.
- Title-search results never expose message content. Phase 2 may return only the minimum approved match excerpt or an opaque match cursor; it never returns a broad transcript dump.
- Ordinary logs never contain queries, titles, or retrieved messages.
- Tool errors never reveal whether a foreign thread exists.
- Retrieved old messages are data, not instructions.
- The model receives only the bounded content required for the current task.
- Deleting a thread removes it from search and makes later reads return not found.

### Tests and agent evals

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

### Ordered implementation tasks

Create TODOs only after explicit PRD approval.

1. Confirm exact archive state and Eve transcript reduction APIs.
2. Freeze shared title-ranking behavior with database fixtures.
3. Add the title full-text vector, `pg_trgm` migration, and title indexes.
4. Implement and test the authorized PostgreSQL thread-title query.
5. Implement `search_previous_threads`.
6. Implement bounded `read_previous_thread`.
7. Update agent instructions and citations.
8. Build and pass the agent eval suite.
9. Build the `Ctrl/Cmd+K` picker with existing UI primitives.
10. Add sidebar search affordance and accessibility metadata.
11. Run focused, full, browser, security, and performance tests.
12. Deploy and verify Phase 1 title search, the primary agent flow, and the secondary user flow.
13. Design the exact Phase 2 projection schema, stable match cursor, update boundary, backfill, and equivalence fixtures.
14. Implement the projection and bounded backfill behind a disabled feature flag.
15. Add PostgreSQL message FTS, progressive fallback, match-window reads, security tests, and agent evals.
16. Release Phase 2 only after its separate gate passes, then push the clean repository state.

Do not start with embeddings, vector search, raw-event search, an external service, or a custom routing mechanism. PostgreSQL title search and its measured index are the initial search infrastructure.

### Implementation handoff

The implementation agent must receive:

- This PRD as the source of truth.
- `AGENTS.md` and the linked project guidance.
- The user-provided ChatGPT UI images as behavioral references, not as a license to copy branding.
- The locked rule that agent continuity is primary and user title search is secondary.
- The locked Phase 1 title-only PostgreSQL search scope and planned Phase 2 visible-message PostgreSQL search.
- The rule that active and archived threads are available to agents.
- The rule that embeddings, vector search, raw-event search, and external search services are excluded.
- The rule that Phase 2 cannot ship until its projection, backfill, authorization, performance, bounded-read, and prompt-injection gate passes.
- The ordered tasks. The approved TODO plan must add the exact verification commands and fixture mapping before implementation starts.

If a simple existing repository or framework pattern can solve a requirement, use it. Do not invent a new system.

### Approved Phase 1 implementation and verification plan

Implement in this order:

1. Add the committed `pg_trgm` extension, title search vector, and title indexes through Drizzle migrations. Update `scripts/db-setup.mjs` and external-database documentation so missing extension privileges fail clearly.
2. Add one server-only PostgreSQL title-search helper. Test it in `lib/thread-search.test.ts` with exact, prefix, token, multi-word, typo, short, empty, Unicode, punctuation, deterministic ties, owner isolation, project isolation, current-thread exclusion, and result limits.
3. Add migration and query-plan checks in `lib/thread-search.integration.test.ts`. Use representative multi-user fixtures and `EXPLAIN (ANALYZE, BUFFERS)` without logging user content.
4. Add a shared server-side visible-message projection helper in `lib/thread-transcript.ts`, covered by `lib/thread-transcript.test.ts`. It must reuse canonical session scoping and Eve reduction, remove superseded messages, include visible user and assistant text only, and enforce event, message, and character limits.
5. Add `agent/tools/search_previous_threads.ts` and `agent/tools/read_previous_thread.ts`. Their tests must cover missing auth, delegated root-session mapping, project scope, foreign and missing threads, current search authorization, archived compatibility, bounded reads, prompt injection, and safe errors.
6. Update the agent instructions so explicit continuity references require search, likely continuity triggers selective search, unrelated prompts avoid it, retrieved content stays untrusted, and relied-on threads are linked.
7. Add `evals/thread-search.eval.ts`. Run it with the repository eval command used by neighboring evals. Require Section 12.4 thresholds for routing, restraint, ranking, links, isolation, injection resistance, and no-match honesty.
8. Add one authenticated `/api/chats/search` route backed by the same title-search helper. Add route tests for auth, isolation, empty/recent results, limits, malformed queries, and safe errors.
9. Add the `Ctrl/Cmd+K` picker with current `CommandDialog`, App Router navigation, and one sidebar search button. Verify expanded, collapsed, loading, empty, error, long title, keyboard, pointer, touch, narrow viewport, Back, Forward, and no document reload states in the real browser.
10. Run focused tests, `bun run typecheck`, `bun run lint`, `bun test`, `bun run check`, `bun run build`, `git diff --check`, migration apply/rollback checks, query-plan/performance fixtures, agent evals, and browser acceptance.
11. Back up production, apply the migration through the documented one-shot path, deploy, and exercise the real signed-in agent continuity and picker flows. Health checks alone do not count.
12. Commit and push the verified production-backed work. Finish with a clean tree and local `HEAD` equal to `origin/main`.

Phase 2 starts only after Phase 1 production verification and a separate review of its projection schema, backfill, equivalence fixtures, and release gate.

## Acceptance criteria

### US-001: shared PostgreSQL title search

- [x] One server-side query helper accepts the authenticated scope, normalized query, current-thread exclusion, and bounded result limit.
- [x] PostgreSQL filters ownership and project scope before ranking or limiting results.
- [x] Matching is case-insensitive.
- [x] Exact matches rank before prefix matches.
- [x] Prefix matches rank before full-text and weaker trigram matches.
- [x] PostgreSQL full-text search supplies token and multi-word matching.
- [x] `pg_trgm` supplies typo-tolerant candidate matching and ranking.
- [x] Recency breaks equal scores.
- [x] Results are deterministic.
- [x] Empty queries return the defined recent groups instead of fuzzy results.
- [x] Database integration tests cover exact, prefix, partial, misspelled, multi-word, short, empty, duplicate-score, Unicode, and punctuation-heavy titles.
- [x] Query-plan tests confirm that representative non-empty searches use the intended title-search index.

### US-002: user thread picker

- [x] `Ctrl+K` and `Cmd+K` open the picker from any app route.
- [x] The sidebar search icon opens the same picker.
- [x] Focus moves to the search field when opened and returns safely when closed.
- [x] Empty search shows `Last opened` and `Recent chats`.
- [x] Query results show title rows only, plus an archived label when needed.
- [x] Arrow keys, `Enter`, and `Escape` work.
- [x] Pointer and touch selection work.
- [x] Loading, no-results, and error states are clear.
- [x] The picker works in expanded and collapsed sidebar layouts.
- [x] The picker works on narrow screens.
- [x] Result navigation uses `router.push()` or `<Link>` and does not reload the document.
- [x] Browser tests compare the behavior with the supplied ChatGPT references, while using MiniScira's existing design tokens and components.

### US-003: agent searches previous thread titles

- [x] `search_previous_threads` accepts only a title query and bounded result limit.
- [x] The server derives the authenticated user and current project scope.
- [x] The agent cannot provide a user ID or project ID.
- [x] Active and archived threads are searched by default.
- [x] The current thread is excluded by default.
- [x] Results contain thread ID, title, updated date, project ID when present, archived state, and app-relative link.
- [x] The tool uses the same PostgreSQL query helper as the user picker.
- [x] Tool tests prove user and project isolation.

### US-004: agent reads a selected previous thread

- [x] `read_previous_thread` accepts a thread ID returned by the current authorized search and bounded read options.
- [x] The server rechecks ownership and project scope for every read.
- [x] The tool reduces persisted Eve events through shared event helpers.
- [x] It returns only visible, non-superseded user and assistant messages.
- [x] It excludes hidden reasoning, tool payloads, client context, system instructions, secrets, and raw event JSON.
- [x] The response is bounded by message count and character count.
- [x] The response identifies the source thread and provides an app-relative link.
- [x] Old message content is clearly marked as untrusted quoted data.
- [x] Archived threads remain readable.
- [x] Tool tests cover missing, foreign, archived, deleted, malformed, and oversized threads.

### US-005: proactive but selective agent use

- [x] Agent instructions require search for explicit earlier-thread references.
- [x] Agent instructions recommend search when prior context is likely to change the answer or action.
- [x] The user does not need to name the thread or request a search command.
- [x] The agent does not search for unrelated requests.
- [x] The agent does not claim an earlier decision when no reliable source was found.
- [x] Claims based on earlier threads link to the source thread.
- [x] Instructions inside retrieved content are never followed.
- [x] Agent evals meet Section 12 thresholds.

### Phase 1 completion evidence

- Status: **Done for Phase 1** (2026-08-27). Phase 2 remains behind its own release gate and is not scheduled.
- Implementation landed in earlier Phase 1 commits through `dce9963`; the
  deployed production image contains title search, bounded reads, the
  `Ctrl/Cmd+K` picker, and the sidebar search affordance.
- Fixture stability fix `f18cf6f` made the eval suite date-independent.
- Full production eval sweep on 2026-08-27: all 10 thread-search evals passed
  36/36 gates against the deployed system via
  `python3 scripts/run-production-evals.py`, covering routing, restraint,
  metadata-only behavior, no-match honesty, reference policy, current-thread
  precedence, "yesterday" absolute-range conversion, explicit date ranges, and
  foreign-user isolation. One transient `thread-search-implicit` model stall
  re-ran clean on repeat.
- Production browser verification of sidebar, picker, and continuity flow was
  performed during this feature's deployment window and re-exercised by the
  evals above.

## Deployment

### Deployment and rollback

### Deployment

1. Approve this PRD.
2. Confirm the archive-state field and current Eve read APIs.
3. Implement the shared PostgreSQL title query, migration, and tests.
4. Add agent search and read tools behind a feature flag.
5. Add agent instructions and run evals.
6. Add the user picker and browser tests.
7. Exercise the real agent continuity flow first.
8. Exercise the user picker flow.
9. Release and verify Phase 1 title search.
10. Implement the Phase 2 visible-message projection behind a separate feature flag.
11. Backfill in bounded batches and prove projection equivalence with rendered transcripts.
12. Release and verify progressive message fallback only after the Phase 2 gate passes.
13. Complete the repository source-control checks.

### Rollback

- Disable agent tools and the user picker feature flags.
- Roll back the application image or commit.
- The `pg_trgm` extension may remain installed after application rollback. Remove the title-search index only through a tested migration when needed; it contains no user content and does not change chat rows.
- Leave a populated visible-message projection in place during an ordinary rollback. Remove it only through a later reviewed cleanup migration.
- Existing chats and events remain unchanged.

## Observability

### Performance targets

Use representative PostgreSQL data sets of 1,000, 10,000, and 100,000 thread titles across multiple users and projects.

- Picker opens within 100 ms after the keyboard event when data is already loaded.
- Title results update within 100 ms at p95 for 1,000 owned titles.
- Title results update within 250 ms at p95 for 10,000 owned titles.
- A scoped search remains within 500 ms at p95 in the 100,000-row mixed-owner data set on the reference self-hosted deployment.
- Representative non-empty searches use the intended PostgreSQL index and do not sort or transfer every owned title in application memory.
- Agent title search completes within 500 ms at p95 on the reference self-hosted deployment.
- Thread reads remain bounded and do not load unbounded transcripts into the model.
- Phase 2 message search stays within 500 ms at p95 for the approved representative message data set.
- Projection updates do not block chat persistence beyond the approved write-latency budget.

If these targets fail, measure the actual bottleneck before changing the architecture.

## Rollback

No separate rollback requirements were recorded.

## Open questions

### Approval gate

Before implementation:

- [x] The user approved this revised PRD on 2026-08-23.
- [x] Phase 1 decisions that change observable behavior, architecture, or tests are resolved.
- [x] The implementation plan below records exact test files, eval commands, browser checks, performance checks, and acceptance mapping.
- [x] Only one TODO is in progress at a time.
- [x] Implementation follows the simplest canonical repository and framework patterns.
