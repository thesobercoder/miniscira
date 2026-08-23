# MiniScira Backlog

This file captures raw product ideas before they are selected and specified.

## Planning workflow

Follow this sequence:

1. **Backlog:** capture the raw idea here. It may still have open questions.
2. **PRD:** when selected for planning, create `tasks/prd-<feature-name>.md` and
   link it from the backlog entry. Define goals, stories, scope, non-goals,
   requirements, acceptance criteria, testing needs, eval needs, deployment,
   observability, rollback, and open questions.
3. **Tasks:** after PRD approval, derive an ordered, atomic implementation plan
   with dependencies, affected areas/files, and acceptance criteria mapped to
   exact tests and evals.
4. **Execution:** implement only from the approved PRD and task plan, then run the
   specified tests, evals, deployment checks, and production acceptance.

Raw backlog entries do not authorize implementation. No item advances to
execution without both a PRD and its derived task/test/eval plan. If model evals
do not apply, the PRD must state why explicitly.

## Backlog

### Artifact Library across all chats

- **Status:** PRD in progress — [`tasks/prd-artifact-library.md`](../tasks/prd-artifact-library.md)
- Add a **Library** destination in the main sidebar immediately below **Lookouts** and above **MCP Servers**.
- Show every artifact the signed-in user has created or received across all chats, including generated images, uploaded files, research exports, and future PDF, DOCX, PPTX, and XLSX outputs.
- Provide useful type, chat, project, and date filters plus filename and content search where indexing is supported.
- Show artifact previews and metadata, with direct links back to the originating chat and turn.
- Allow users to download artifacts and perform safe lifecycle actions without deleting the source chat implicitly.
- Enforce strict per-user authorization and make missing, expired, or deleted backing files explicit rather than leaving broken entries.

Before implementation, create a focused PRD covering the artifact data model, existing upload/generated-file discovery, sidebar and Library UX, previews, search and filtering, source-chat provenance, retention and deletion semantics, authorization, migrations, and end-to-end tests.

### Edit uploaded images with natural-language instructions

**Status:** PRD in progress — [Draft PRD](../tasks/prd-image-editing.md)

- Let users upload an image and describe the desired changes conversationally.
- Preserve the original and save every edited result as a new durable file.
- Support common edits such as removing or adding objects, changing backgrounds, recoloring, extending the canvas, and restyling.
- Preserve important composition, identity, and fine details when the requested edit does not change them.
- Show progress and the completed edited image directly in the conversation.
- Route automatically to a configured image-editing-capable model; do not expose provider or backend controls to ordinary users.
- Report clearly when the configured image backend supports generation only and cannot edit images.

Before implementation, verify the live gateway's image-editing endpoint and input contract, then create a focused PRD covering uploads, model routing, storage, timeline rendering, privacy, failure states, and end-to-end tests.

### Generate editable documents and presentations

- **Status:** PRD in progress — [`tasks/prd-document-generation.md`](../tasks/prd-document-generation.md)
- Generate PDF, DOCX, PPTX, and XLSX artifacts directly from a conversation.
- Provide the completed artifact as a durable downloadable file and preserve it with the chat.
- Prefer editable native formats for DOCX, PPTX, and XLSX rather than rendered screenshots.
- Support sensible templates, page or slide structure, tables, charts, citations, and document metadata.
- Preview or summarize the produced artifact before download and report formatting limitations clearly.
- Run generation inside the existing isolated Sandbox and validate every produced file before presenting it.

Before implementation, create a focused PRD covering artifact schemas, rendering libraries, templates, storage, previewing, citations, validation, accessibility, security, and end-to-end tests for each format.

### Clone and analyze GitHub repositories

- **Status:** PRD in progress — [`tasks/prd-github-repository-analysis.md`](../tasks/prd-github-repository-analysis.md)
- Accept a GitHub repository URL and clone it into an isolated, per-task Sandbox workspace.
- Answer questions from the repository's actual files, structure, configuration, and Git history with file-and-line citations.
- Support public repositories first; add private repositories later through revocable user-owned credentials that are never exposed to the model or persisted in source control.
- Respect repository size, clone depth, file-count, binary-file, submodule, and timeout limits.
- Reuse an existing safe checkout for follow-up questions when appropriate, while making refresh and revision identity explicit.
- Treat repository content as untrusted input and do not execute project code unless the user explicitly asks and Sandbox policy permits it.

Before implementation, create a focused PRD covering repository identity and revision pinning, clone lifecycle, credentials, indexing, citations, refresh behavior, Sandbox egress, prompt-injection handling, cleanup, and end-to-end tests.

### Archive and recover chat threads

- **Status:** PRD in progress — [`tasks/prd-thread-archiving.md`](../tasks/prd-thread-archiving.md)
- Let users manually archive and unarchive threads without deleting their messages, events, documents, or generated artifacts.
- Exclude archived threads from the normal sidebar and provide a dedicated archived-threads view with recovery actions.
- Offer an optional per-user auto-archive policy, including a one-week inactivity setting; base inactivity on the last real chat activity rather than background maintenance timestamps.
- Never auto-archive an active research run, an explicitly pinned thread, or a thread needed by a running Lookout.
- Keep archival reversible and separate from permanent deletion and retention policies.

Before implementation, create a focused PRD covering schema and migration changes, manual actions, inactivity semantics, pinning, Lookout interactions, batch scheduling, recovery UX, authorization, and end-to-end tests.

### Search and read previous threads

**Status:** PRD in progress — [draft PRD](../tasks/prd-thread-search.md)

- Search the signed-in user's other threads by title and message content from inside MiniScira.
- Open matching threads directly and show enough context around each match to understand why it was returned.
- Make archived threads searchable with an explicit archived-state label.
- Allow the research agent to retrieve relevant prior-thread excerpts when needed, with thread and message citations, without silently blending them into the current conversation.
- Enforce strict per-user and project authorization boundaries and avoid leaking private thread content through indexes or logs.

Before implementation, create a focused PRD covering lexical and semantic retrieval, indexing and updates, result snippets, citations, authorization, archived-thread behavior, agent-tool access, privacy, and end-to-end tests.

### Nightly memory extraction from the day's chats

- **Status:** PRD in progress — [`tasks/prd-nightly-memory-extraction.md`](../tasks/prd-nightly-memory-extraction.md)
- Run an optional nightly, per-user extraction pass over chats that had user activity during that user's local calendar day.
- Extract only durable, useful memories such as stable preferences, decisions, recurring entities, and long-lived project context; reject transient task progress, secrets, raw identifiers, and speculative conclusions.
- Deduplicate against existing memory and keep provenance back to the source thread and message range.
- Present extracted candidates for review initially; automatic promotion should require confidence thresholds, contradiction handling, and an audit trail.
- Make runs idempotent and checkpointed so retries do not duplicate memories, and allow users to inspect, correct, or delete extracted memories.
- Use an in-database lease and timezone-aware schedule compatible with the existing MiniScira scheduling architecture.

This is feasible, but before implementation create a focused PRD covering the memory store and retrieval contract, local-day boundaries, eligible chats, extraction schema, privacy and secret filtering, provenance, deduplication, contradiction resolution, review versus automatic promotion, scheduling, cost controls, and end-to-end tests.
