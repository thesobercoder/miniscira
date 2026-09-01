# PRD: artifact library across all chats

- **Status:** To do
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-artifact-library)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Not approved
- **Repository architecture:** [README](../README.md)
- **Canonical engineering constraints:** [Development principles](../docs/DEVELOPMENT_PRINCIPLES.md), [Engineering invariants](../docs/ENGINEERING_INVARIANTS.md), and [Deployment guide](../docs/DEPLOYMENT.md)
- **Scope:** Planning only. This document does not allow implementation. The user must approve this PRD before implementation TODOs are created or executed.

## Goal

### Problem

MiniScira already creates and receives several artifact forms, but they are discoverable only inside the chat where they appeared:

- uploaded images and documents are stored in the `document` table and local uploads volume;
- generated images are local blobs referenced only by persisted Eve tool events;
- complete code/text deliverables created by the `artifact` tool are stored only inside persisted Eve events and downloaded in the browser;
- future PDF, DOCX, PPTX, and XLSX generation will need the same durable discovery, provenance, authorization, preview, search, and lifecycle surface.

Users cannot browse all of these across chats. Some stored files are served by an unguessable URL rather than an ownership-checked artifact endpoint, generated images have no dedicated database row, and a missing local file becomes a broken URL without a durable, user-visible state.

Add a signed-in, per-user **Library** that inventories every supported artifact created or received across the user's chats. It supplies previews and metadata, useful filters and supported content search, source-chat and source-turn provenance, authorized downloads, and safe lifecycle actions that never delete a source chat implicitly.

### goals

1. Add **Library** to the main sidebar immediately below **Lookouts** and above **MCP Servers**.
2. Give each signed-in user one complete, paginated inventory of their uploaded files, generated images, tool-created code/text artifacts, research exports, and future durable PDF/DOCX/PPTX/XLSX outputs.
3. Preserve durable provenance to the originating chat and turn when that source still exists, while keeping the artifact usable if the source chat is later deleted.
4. Support useful type, chat, project, and date filters, filename search, and lexical content search only where searchable text exists.
5. Provide safe previews, metadata, direct downloads, explicit unavailable states, and lifecycle actions that do not implicitly delete a source chat.
6. Enforce ownership in every Library query, metadata read, preview, download, and mutation; unguessable URLs do not prove authorization.
7. Discover and register existing uploaded and generated artifacts through an additive, idempotent migration/backfill path without changing the schema during normal startup.
8. Establish an extensible artifact contract that future PDF, DOCX, PPTX, and XLSX generators can write without redesigning the Library.

## User stories

### Users and main use cases

### 4.1 Signed-in researcher

Wants to find a file or generated deliverable without remembering which chat produced it, preview it, download it, or return to its source context.

### 4.2 Project user

Wants to narrow the Library to artifacts associated with one project or one chat and understand which project/chat produced each result.

### 4.3 Self-hosted operator

Wants migrations and backfills to be explicit, observable, restartable, compatible with durable database/upload backups, and safe to roll back.

## Scope

### Scope and fixed decisions

These decisions are part of this draft and should not be improvised during implementation. Open questions in Section 20 require explicit resolution before approval if they would change these decisions.

### 5.1 Included artifact sources

The Library includes:

1. **Uploaded files:** existing and future rows currently represented by `document`, including images, PDFs, and supported text documents.
2. **Generated images:** successful `generate_image` tool outputs with locally stored backing files.
3. **Code/text artifacts and research exports:** successful `artifact` tool outputs, including HTML, Markdown, SVG, GenUI, code, configuration, reports, and other complete text deliverables.
4. **Future durable office/document outputs:** PDF, DOCX, PPTX, and XLSX records written through the same artifact registration contract when those generators are implemented.

Failed tool calls that never produced usable content or a backing file are not Library artifacts. Upload rows in `processing` or `error` state are included only when a durable `document` row exists; their processing/error state is explicit.

### 5.2 Artifact durability

An artifact is a user-owned durable object, not only a projection of a chat event. Deleting a source chat must set artifact provenance fields to null or unavailable, not delete the artifact. Existing chat deletion behavior for chat events does not change.

### 5.3 First-release lifecycle actions

The first release provides exactly these safe actions:

- **Download** when content/backing is available.
- **Remove from Library** (reversible): sets `libraryHiddenAt`; it does not delete content, the source chat, or the source event. A “Hidden” filter/view allows restoration.
- **Delete backing file** for blob-backed artifacts (irreversible after confirmation): deletes only the stored file, records a tombstone state, preserves metadata/provenance, and never deletes the source chat. The chat and Library must render the artifact as unavailable after deletion.
- **Restore to Library:** clears `libraryHiddenAt` when content has not been permanently deleted.

Permanent deletion/redaction of inline code/text content from historical `chat_event.event` JSON is not included because it would require transcript mutation and a separate retention/redaction design. Removing a text artifact from the Library is therefore hide/unhide only in this release.

### 5.4 Search rules

- Search is lexical, case-insensitive, and scoped to the signed-in user.
- Every artifact supports filename/title search.
- Content search applies only when `searchText` exists: extracted upload text, inline code/text artifact content, generated-image prompt/description, or future generator-supplied extracted text.
- Binary formats without extracted text remain filename/title searchable and show “Content search unavailable” in metadata where relevant.
- Semantic/vector artifact search and agent retrieval from the Library are not part of this release.

### 5.5 Filter rules

The Library supports filters that can be combined:

- **Type:** All, Images, Documents, Code & text, and Exports, with format details shown from MIME type/language. Future PDF/DOCX/PPTX/XLSX records fit Documents or Exports without a schema change.
- **Chat:** one originating chat or all chats; unavailable/deleted source is a distinct option.
- **Project:** one project, No project, Deleted/unavailable project, or all projects.
- **Date:** Any time, Today, Previous 7 days, Previous 30 days, or an inclusive custom local-date range converted to UTC boundaries by the client.
- **Visibility:** Active by default; Hidden is an explicit view.

Filters and search are represented in URL query parameters so navigation, refresh, and copied links preserve the view. The server validates and normalizes all parameters.

### 5.6 Sorting and pagination

- Default order is newest artifact first by `(createdAt DESC, id DESC)`.
- Pagination is keyset/cursor-based, not offset-based.
- The initial page size is 30, with a server-enforced maximum of 100.
- Applying or changing a search/filter resets the cursor.

## Non-goals

This PRD does not include:

1. Implementing PDF, DOCX, PPTX, or XLSX generation; it only makes the Library data model ready to inventory those future outputs.
2. Natural-language image editing or artifact editing/version history.
3. Semantic/vector search, OCR, image recognition, or model-generated tagging of Library items.
4. Giving the research agent a tool to search/read the Library; existing document retrieval does not change.
5. Sharing artifacts between users, public links, anonymous downloads, team workspaces, or ACLs beyond strict owner access.
6. Bulk export/download, folders, tags, favorites, pinning, manual renaming, or drag-and-drop organization.
7. Automatic retention/expiry policy configuration or storage quotas.
8. Permanent redaction of inline artifact content from historical chat events.
9. Deleting a source chat as an artifact lifecycle side effect.
10. Recovering physically deleted bytes without a backup.
11. Parsing or rendering DOCX/PPTX/XLSX content in the Library request path; safe metadata fallback is sufficient until a validated preview rendition exists.
12. Replacing the existing `document` ingestion/RAG model with the artifact table.
13. Changing the canonical agent search, model routing, auth chain, durable stream, scheduling, or Sandbox architecture.

## Functional requirements

### User experience

### 6.1 Sidebar

Add a Library row to the single `NAV` source in `components/sidebar-nav.tsx`:

```text
Projects
Lookouts
Library
MCP Servers
```

It must participate in the existing active-route and collapsed-sidebar tooltip behavior.

### 6.2 Library page

Route: `/library` in the authenticated app shell.

Desktop layout:

- page title and concise count/result summary;
- search field;
- filter controls for type, chat, project, date, and visibility;
- responsive grid/list of artifact cards;
- progressive “Load more” pagination;
- detail/preview drawer or panel opened from a card without losing the current URL-backed filters.

Narrow screens:

- filters collapse into a sheet/dialog;
- artifact cards use a single-column layout;
- preview opens as a full-height sheet/page;
- primary download and source-chat actions remain reachable without hover.

### 6.3 Artifact card details

Each card shows, when available:

- preview/thumbnail or safe generic type icon;
- display title/filename;
- media class and concrete format (MIME, extension, or language);
- size for byte-backed artifacts;
- created date/time;
- source chat title;
- source project name;
- status: ready, processing, error, missing, deleted, or hidden;
- whether content search is supported.

A missing project/chat is displayed as unavailable rather than as a broken link.

### 6.4 Preview rules

- **Images:** authorized thumbnail/full image with intrinsic dimensions when known; prompt/alt metadata displayed separately.
- **Plain text/code/config:** syntax-highlighted read-only preview with bounded initial payload and explicit full download.
- **Markdown:** rendered through the existing safe Markdown renderer with a source view option.
- **HTML/SVG:** reuse the artifact iframe isolation pattern; do not grant same-origin access. HTML scripts may run only inside the current sandboxed `srcDoc` model and must not receive MiniScira cookies/storage.
- **GenUI:** reuse the existing read-only GenUI preview path.
- **PDF:** authorized browser-native/embed preview where supported, with download fallback.
- **DOCX/PPTX/XLSX and unsupported binary types:** metadata/icon preview in this release unless a future generator provides a separately validated preview rendition.
- **Processing/error/missing/deleted:** explicit state panel; never render a broken `<img>`, blank iframe, or endless skeleton.

Preview endpoints must support bounded ranges or bounded text responses where the format supports them. The Library list endpoint must not return full inline content or extracted text.

### 6.5 Source chat links

When the source chat exists and belongs to the user, “Open source” navigates to `/chat/<chatId>` with an artifact/turn fragment or query marker. The chat page must:

- locate the source turn using a stable provenance locator;
- scroll it into view after rehydration;
- briefly highlight/focus the artifact or attachment;
- fall back to the chat top with a clear notice if the exact event/turn can no longer be found.

For uploaded files, use the bound user `messageIndex` as legacy provenance and add a stable source locator during registration/backfill. For tool outputs, use the persisted Eve event identity/tool call identity rather than a UI array index alone.

### Inventory and query

- **FR-001:** The system must expose an authenticated `/library` page and Library API surface.
- **FR-002:** Every Library list query must include `artifact.userId = session.user.id` in SQL.
- **FR-003:** The list API must return metadata only and must not return full inline content, extracted text, storage keys, or raw chat events.
- **FR-004:** The list API must support the search, filters, sorting, and cursor rules in Section 5.
- **FR-005:** The list API must return current source chat/project display metadata only through user-scoped joins.
- **FR-006:** The list API must expose a stable availability/status enum and preview capability metadata so the UI does not infer state from a URL.
- **FR-007:** The query must remain deterministic when multiple artifacts share a timestamp by using the artifact UUID as a tie-breaker.

### Registration and discovery

- **FR-008:** A shared server-side registration service must accept trusted execution context and normalized artifact metadata. It must perform an idempotent insert or update.
- **FR-009:** Stable source identities must be unique per user/source: uploaded document ID; tool-producing chat plus tool call/event identity; future generator job/output identity.
- **FR-010:** Upload flows must associate the existing `document` row with one artifact record without duplicating file bytes or extracted content.
- **FR-011:** Generated images must be stored under a user-owned artifact record at generation time, with source chat/turn resolved from authenticated Eve session context.
- **FR-012:** Code/text artifact tool outputs must be registered with normalized title, language, complete inline content reference, source identity, and searchable text.
- **FR-013:** Research exports implemented through the existing artifact tool or a future file generator must use the same artifact registration path.
- **FR-014:** Future PDF/DOCX/PPTX/XLSX outputs must be representable as blob-backed artifacts without schema changes.
- **FR-015:** Registration must not accept ownership or storage authority from model-controlled input.

### Preview and download

- **FR-016:** Metadata, preview, content, and download endpoints must be authenticated and ownership-scoped.
- **FR-017:** Blob-backed responses must resolve a server-held storage key/reference, never an arbitrary request path or caller-supplied URL.
- **FR-018:** Download responses must sanitize filenames, set `Content-Disposition: attachment`, preserve/normalize MIME type, set `X-Content-Type-Options: nosniff`, and use private/no-store or appropriately private caching.
- **FR-019:** Inline artifacts must be downloadable through the authorized artifact endpoint.
- **FR-020:** Preview rendering must follow Section 6.4 and must not execute untrusted content in the MiniScira origin.
- **FR-021:** Preview payload limits must be enforced on the server; the initial text/code preview limit is 512 KiB, with explicit truncation metadata.
- **FR-022:** Blob response code should support HTTP range requests for PDF/media preview where practical and must stream rather than buffer large files.
- **FR-023:** Old `/api/files/*` links retained in historical events must no longer rely on unguessability alone; they must resolve to a registered, owned artifact or return unavailable/not found.

### Provenance and source links

- **FR-024:** Artifact rows must preserve source chat, project, source kind, source event/tool identity, and source turn locator when available.
- **FR-025:** Chat/project deletion must not cascade-delete artifacts; provenance becomes unavailable through `SET NULL` or equivalent explicit state.
- **FR-026:** The source link must verify ownership at navigation/read time and must not reveal inaccessible IDs or titles.
- **FR-027:** Chat rendering must consult artifact availability for registered generated/uploaded artifacts so deleted/missing backing is explicit even if a historical event contains a stale URL.

### Lifecycle

- **FR-028:** Hide, restore, and delete-backing mutations must be idempotent and ownership-scoped.
- **FR-029:** Hide/restore must not modify chat, chat events, `document.content`, document retrieval eligibility, or file storage.
- **FR-030:** Delete-backing must preserve the artifact tombstone and source chat; it must not be implemented as chat deletion.
- **FR-031:** Delete-backing must be rejected for inline-only artifacts in this release.
- **FR-032:** Missing backing discovered during preview/download/backfill must be represented in artifact state and surfaced to the user.
- **FR-033:** Storage deletion errors must not falsely report success; the response and telemetry must distinguish database tombstoning from failed physical deletion.

### Migration and operations

- **FR-034:** Schema changes must use committed Drizzle migration files and must not be applied implicitly during normal startup.
- **FR-035:** Backfill must be an explicit, bounded, restartable operation with batch size and dry-run/report modes.
- **FR-036:** Backfill must scan only supported event shapes through centralized event/tool-output parsers; arbitrary `.type` inspection outside `lib/chat-events.ts` remains prohibited.
- **FR-037:** Backfill must not download remote/foreign URLs. It may register them as unsupported/unavailable only if the backlog scope requires their record; this release's usable backing is local storage or inline content.
- **FR-038:** Deployment must preserve both database and uploads volumes and require backups of both before migration/backfill.

### non-functional requirements

- **NFR-001 — Authorization:** Every artifact operation is denied by default and scoped to the authenticated user in SQL. UUIDs, random blob names, and source links are not authorization controls.
- **NFR-002 — Privacy:** Logs and metrics must exclude filenames, titles, prompts, content, extracted text, storage paths/keys, event JSON, and query text.
- **NFR-003 — Performance:** For a user with 10,000 artifacts, p95 metadata list requests should complete within 500 ms on the reference self-hosted Postgres deployment, excluding network latency, with indexes used for ownership/order and supported filters/search.
- **NFR-004 — Payload size:** The first Library list response should remain below 250 KiB for 30 normal metadata rows; preview content is fetched separately.
- **NFR-005 — Scalability:** Queries use keyset pagination and indexed predicates; the UI does not fetch all chats, projects, or artifacts only to render the first page.
- **NFR-006 — Reliability:** Registration and backfill are idempotent. A partial storage or database failure produces a recoverable state, not an orphan silently reported as success.
- **NFR-007 — Accessibility:** Library controls meet keyboard, focus, label, contrast, and screen-reader requirements; status is conveyed by text/icon, not color alone.
- **NFR-008 — Responsive UX:** All core actions work at narrow mobile widths without hover-only controls.
- **NFR-009 — Security isolation:** Untrusted HTML/SVG/GenUI previews cannot access the authenticated parent origin or navigate it without explicit user action.
- **NFR-010 — Compatibility:** Existing chats, event replay, attachment rendering, document search, image generation, and browser artifact panels continue to work during rollout.
- **NFR-011 — Data integrity:** No action in this feature implicitly deletes source chats. Chat deletion does not implicitly delete Library artifacts.
- **NFR-012 — Operability:** Backfill progress, failures, missing backing, and registration failures are observable without sensitive payloads.

## Technical requirements

### Success criteria and metrics

### 3.1 Release acceptance metrics

- 100% of supported pre-release artifact fixtures are discoverable after backfill, with no duplicate records after a second backfill run.
- 100% of cross-user metadata, preview, download, and lifecycle requests in the authorization suite are denied without exposing whether the artifact exists.
- 100% of artifacts with missing or deleted backing files render an explicit unavailable/tombstone state rather than a broken preview.
- A user can reach the Library in one sidebar action and reach an artifact's source chat/turn in one action when provenance is available.
- All list/filter/search combinations in the test matrix return only matching artifacts and retain stable pagination without duplicate or skipped rows.
- Removing an artifact from the Library or deleting its backing file never deletes or mutates the source `chat` row.

### 3.2 Operational metrics after release

Record these metrics without logging filenames, extracted content, prompts, storage keys, signed URLs, or user secrets:

- Library list request count, latency, result count, and error rate;
- preview/download request count, bytes streamed, latency, unavailable count, and error rate;
- artifact registration count by `sourceKind`, `mediaClass`, and outcome;
- backfill scanned/discovered/inserted/skipped/conflict/unavailable counts;
- lifecycle mutation count by action and outcome;
- authorization rejection count by endpoint and status class;
- orphan/missing-backing detection count.

No usage-growth target is imposed for the first release; correctness, completeness, and authorization are the launch gates.

### proposed data model

### 10.1 New `artifact` table

Proposed fields (exact SQL types/names may be adjusted during approved implementation only if behavior does not change):

| Field | Purpose |
|---|---|
| `id uuid primary key` | Stable Library identity. |
| `userId text not null` | Owner; FK to `user` with `ON DELETE CASCADE`. |
| `chatId uuid null` | Origin chat; FK to `chat` with `ON DELETE SET NULL`. |
| `projectId uuid null` | Origin project snapshot/link; FK to `project` with `ON DELETE SET NULL`. |
| `documentId uuid null` | Existing upload/document row; FK to `document` with `ON DELETE SET NULL`, unique when non-null. |
| `sourceKind text not null` | `upload`, `artifact_tool`, `generated_image`, `research_export`, `generated_file`. |
| `sourceKey text not null` | Deterministic trusted identity such as `document:<id>` or `chat:<id>:tool:<callId>`; never shown to clients. |
| `sourceEventId text null` | Eve server event ULID when available. |
| `sourceToolCallId text null` | Tool call identity when available. |
| `sourceTurnId text null` | Durable Eve turn identity when available. |
| `sourceMessageIndex integer null` | Legacy uploaded user-turn locator and fallback provenance. |
| `title text not null` | Human display title. |
| `filename text not null` | Sanitized download filename (display may retain original separately only if needed). |
| `mediaClass text not null` | `image`, `document`, `code_text`, `export`, `other`. |
| `mimeType text not null` | Normalized MIME type. |
| `language text null` | Artifact-tool language/format where applicable. |
| `storageKind text not null` | `local_blob` or `inline`. Future values require review. |
| `storageKey text null` | Server-only local blob leaf/key, not a URL. Required for `local_blob`. |
| `inlineContent text null` | Complete text artifact content. Required for `inline`; absent from list responses. |
| `searchText text null` | Normalized extracted/searchable text. May reference/copy `document.content` during registration; see open question OQ-003. |
| `sizeBytes integer not null default 0` | Byte size when known. |
| `availability text not null` | `processing`, `available`, `error`, `missing`, `expired`, `deleted`. |
| `errorCode text null` | Non-sensitive typed failure code, not raw provider/path error text. |
| `libraryHiddenAt timestamp null` | Reversible removal from default Library. |
| `deletedAt timestamp null` | Backing deletion/tombstone time. |
| `createdAt timestamp not null` | Artifact creation/receipt time, sourced from document/event time. |
| `updatedAt timestamp not null` | Metadata/state update time. |

Constraints:

- unique `(userId, sourceKey)` for idempotent registration/backfill;
- `storageKind=local_blob` requires `storageKey` and forbids `inlineContent`;
- `storageKind=inline` requires `inlineContent` and forbids `storageKey`;
- `availability=deleted` requires `deletedAt`;
- only trusted server code creates `sourceKey`, ownership, provenance, and storage references.

Recommended indexes:

- `(userId, libraryHiddenAt, createdAt DESC, id DESC)` for default/hidden inventory;
- `(userId, mediaClass, createdAt DESC, id DESC)`;
- `(userId, chatId, createdAt DESC, id DESC)`;
- `(userId, projectId, createdAt DESC, id DESC)`;
- unique `(userId, sourceKey)`;
- unique partial `documentId` where non-null;
- PostgreSQL GIN full-text index over a normalized `tsvector` derived from title/filename/search text, or a generated/stored `searchVector` if Drizzle/migration support is verified during implementation.

### 10.2 Existing `document` table

Keep `document` as the source of truth for document ingestion and retrieval-augmented generation (RAG). Add a nullable unique `artifactId` only if it clearly simplifies joins. Otherwise, `artifact.documentId` is the canonical one-way association. Do not duplicate blob bytes. Library hide and restore actions must not change document search behavior or `document.content`.

### 10.3 Existing `chat_event` table

Persisted events remain the transcript/event source. New tool-created artifacts must write a first-class artifact row and include/derive a stable artifact ID in rendering. Historical event JSON is not destructively rewritten by the schema migration. The backfill parses supported tool output shapes and associates the resulting artifact row through stable event/tool identities.

### 10.4 Availability and source status

`availability` describes whether artifact content can be previewed/downloaded. Upload processing status may originate in `document.status`; registration/reconciliation maps it to the artifact enum. Source provenance availability (chat/project exists) is derived separately so a deleted chat does not mark an otherwise downloadable file as missing.

### API and server design

Proposed authenticated API surface:

- `GET /api/artifacts` — metadata list, cursor, filters/search.
- `GET /api/artifacts/facets` — user-scoped chat/project/filter options and counts where economical.
- `GET /api/artifacts/:id` — metadata/detail and preview capabilities.
- `GET /api/artifacts/:id/preview` — bounded authorized preview/rendition.
- `GET /api/artifacts/:id/download` — authorized attachment download/stream.
- `PATCH /api/artifacts/:id` — hide or restore through a narrow action schema.
- `DELETE /api/artifacts/:id/backing` — confirmed byte-backed deletion only.

All handlers use `authed`/`authedWithParams` and a centralized `ownedArtifact`/`requireOwnedArtifact` SQL helper. For object probing resistance, inaccessible IDs should use the repository's canonical not-found behavior consistently; tests must lock the chosen 404/403 semantics.

Shared server modules should separate:

1. artifact normalization and registration;
2. ownership-scoped artifact queries;
3. storage-key parsing/resolution and streaming;
4. supported event-to-artifact extraction;
5. search/filter/cursor validation;
6. preview capability selection;
7. availability reconciliation.

Likely affected areas during implementation (not an authorization to edit):

- `lib/db/schema.ts`, `lib/db/migrations/*`;
- new `lib/artifacts*.ts` modules and focused unit tests;
- `lib/api-ownership.ts`;
- `lib/local-blob.ts` and `app/api/files/[...path]/route.ts`;
- new `app/api/artifacts/**` routes;
- `app/api/documents/**` and `hooks/use-chat-attachments.ts`;
- `agent/tools/artifact.ts`, `agent/tools/generate_image.ts`, and authenticated Eve-session-to-chat resolution;
- `lib/chat-events.ts` plus supported parsers;
- `components/sidebar-nav.tsx`, new Library page/components, existing artifact/image/attachment rendering, and source-turn navigation;
- explicit backfill command/script and deployment documentation.

### security and privacy requirements

### 13.1 Authorization boundaries

- Authentication is required for page and API access.
- Ownership is enforced in SQL for list/detail/mutations.
- Parent `chatId`, `projectId`, and `documentId` are validated as belonging to the same user before registration/linking.
- Eve tools derive `userId` from `ctx.session.auth.current` and resolve the root session to a user-owned chat; model input cannot select an owner.
- A foreign artifact UUID, source key, chat ID, project ID, old blob URL, or storage leaf must not reveal metadata, timing-significant detail, preview bytes, or existence.

### 13.2 Storage safety

- Store a normalized server-only storage key, never accept an arbitrary path/URL on preview/delete requests.
- Resolve paths under `LOCAL_STORAGE_DIR` and reject traversal, encoding tricks, symlinks escaping the root, and non-local/foreign URLs.
- Deletion operates on exactly one owned artifact's key and is idempotent.
- If historical duplicate references share a backing key, physical deletion must require a reference check and produce consistent tombstones for all same-owner references; it must never affect a different owner silently. Prefer deduplicating identity during backfill rather than shared untracked keys.

### 13.3 Content safety

- Set `nosniff` and safe disposition/cache headers.
- Sanitize filenames for headers and downloads.
- Keep HTML/SVG previews in sandboxed opaque-origin iframes. Do not use unsandboxed `dangerouslySetInnerHTML` for user/model HTML or SVG.
- Bound preview sizes and protect against decompression bombs or automatic parsing of untrusted Office archives in the request path.
- PDF/Office generation and validation are separate backlog features; the Library does not claim such binaries are safe only because they are indexed.

### 13.4 Privacy and logging

- Search input, filenames, content, prompts, URLs, local paths, storage keys, event bodies, and extracted text are sensitive.
- Structured logs use artifact/source-kind/media-class IDs only where necessary and should hash or omit user/artifact identifiers according to existing logging conventions.
- Error messages returned to users must not expose filesystem paths, SQL detail, provider secrets, or another user's existence.

### Test matrix

All test identifiers are referenced by traceability in Section 19.

### 16.1 Unit tests

| ID | Area | Cases |
|---|---|---|
| UT-001 | Artifact normalization | filename sanitation, MIME/language normalization, media-class mapping, missing fields, size bounds. |
| UT-002 | Source identity | deterministic document/tool/generated-file keys; distinct chats/tool calls do not collide. |
| UT-003 | Cursor codec | encode/decode, malformed/tampered cursor, timestamp/UUID tie-break, filter change reset. |
| UT-004 | Filter validation | valid/invalid type/chat/project/date/visibility/page-size parameters. |
| UT-005 | Search normalization | case folding, whitespace, special characters, max length, empty query. |
| UT-006 | Preview capability | image/text/Markdown/HTML/SVG/GenUI/PDF/Office/unsupported/error/missing/deleted mapping. |
| UT-007 | Event extraction | complete `artifact` and `generate_image` outputs; streaming input fallback excluded from backfill until delivered; failed/malformed/duplicate events. |
| UT-008 | Availability transitions | processing/available/error/missing/expired/deleted; legal and idempotent transitions. |
| UT-009 | Storage resolution | local key extraction, traversal/encoding/symlink escape rejection, foreign URL rejection. |
| UT-010 | Download headers | filename quoting/UTF-8, MIME, disposition, nosniff, private cache. |
| UT-011 | Source locator | uploaded message index and tool event/call locator generation/fallback. |
| UT-012 | Lifecycle policy | hide/restore all types; delete-backing only blob-backed; repeated actions. |

### 16.2 Database/integration tests

| ID | Area | Cases |
|---|---|---|
| IT-001 | Ownership queries | two users with same-looking titles/files; every list/facet/detail query returns only owner rows. |
| IT-002 | Pagination | equal timestamps, insert between pages, next cursor, no duplicate/skip in defined snapshot semantics. |
| IT-003 | Filters/search | each filter alone and all combinations; title, filename, extracted text, prompt, inline content; unsupported binary. |
| IT-004 | Registration | upload, generated image, inline artifact, future generated file fixture; idempotent retries. |
| IT-005 | Parent validation | foreign chat/project/document IDs rejected and not linked. |
| IT-006 | Source deletion | deleting chat/project sets provenance unavailable and preserves artifact/content. |
| IT-007 | Document behavior | hide/delete Library state does not alter document retrieval content; backing deletion produces explicit retrieval behavior. |
| IT-008 | Missing backing | file removed out of band; preview/download response and state reconciliation. |
| IT-009 | Shared/duplicate key safety | deletion affects only intended owned references and never another user's file. |
| IT-010 | Range/streaming | PDF/media range response, large file streamed, bounded memory behavior. |
| IT-011 | Legacy file route | authenticated owner succeeds after registration; anonymous/foreign/unregistered requests fail safely. |
| IT-012 | Chat rendering state | stale event URL plus deleted/missing artifact renders tombstone, not working media. |

### 16.3 Migration/backfill tests

| ID | Area | Cases |
|---|---|---|
| MT-001 | Empty migration | new database applies all migrations successfully. |
| MT-002 | Upgrade migration | current schema/data upgrades without destructive changes. |
| MT-003 | Document backfill | ready/processing/error image and document rows, staged/no-chat rows, project/no-project rows. |
| MT-004 | Event backfill | code/text/Markdown/HTML/SVG/GenUI artifacts and generated images across multiple sessions/chats. |
| MT-005 | Bad historical data | malformed tool output, absent event ID, duplicate replay, foreign URL, missing local blob. |
| MT-006 | Interruption/rerun | terminate mid-batch, resume, rerun twice, no duplicates, stable counts. |
| MT-007 | Rollback restore | restore coordinated DB/uploads backup and previous image; pre-feature chats/files still work. |
| MT-008 | Performance | representative large dataset completes within operator-approved maintenance window with bounded memory/concurrency. |

### 16.4 Authorization/security tests

| ID | Area | Cases |
|---|---|---|
| ST-001 | Anonymous | list/facets/detail/preview/download/mutations denied. |
| ST-002 | IDOR | User B tries User A UUID/source chat/project/document/tool-call references on every endpoint. |
| ST-003 | Old URL | guessed/known `/api/files/<leaf>` cannot bypass ownership. |
| ST-004 | Path handling | `..`, encoded separators, absolute paths, null bytes, symlink escape, foreign URLs. |
| ST-005 | Header injection | CR/LF, quotes, Unicode, very long filenames in `Content-Disposition`. |
| ST-006 | Preview isolation | hostile HTML/SVG attempts cookie/storage/API access, parent navigation, popups, and script escape. |
| ST-007 | Search injection | SQL/FTS operators, wildcards, oversized input; parameterized behavior and no log leakage. |
| ST-008 | Registration trust | model/tool input attempts to claim another user/chat/storage key. |
| ST-009 | Deletion race | concurrent download/delete/hide/restore and repeated requests remain safe. |
| ST-010 | Sensitive telemetry | automated assertion/review that logs omit filenames, queries, prompts, content, storage keys, and event JSON. |

### 16.5 Browser/end-to-end tests

| ID | Flow | Cases |
|---|---|---|
| E2E-001 | Sidebar/page | placement, active state, collapsed tooltip, auth redirect. |
| E2E-002 | Browse | mixed artifact grid, metadata, load more, stable history/navigation. |
| E2E-003 | Search/filter | all selectors, combined filters, URL persistence, custom dates, clear all. |
| E2E-004 | Preview | image, text/code, Markdown, HTML, SVG, GenUI, PDF, Office fallback, unsupported binary. |
| E2E-005 | Download | inline and blob artifacts preserve filename/content/MIME. |
| E2E-006 | Provenance | open uploaded user turn and generated assistant tool call; deleted-source fallback. |
| E2E-007 | Lifecycle | hide, Hidden view, restore, delete backing confirmation/tombstone, source chat unchanged. |
| E2E-008 | Failures | API error/retry, processing, source error, missing, expired, deleted. |
| E2E-009 | Accessibility | keyboard-only filter/preview/actions, focus return, screen-reader labels/status, reduced motion. |
| E2E-010 | Responsive | representative narrow mobile and desktop widths; no hover-only action. |
| E2E-011 | Cross-user | two browser contexts prove no cross-account list/detail/download/source leakage. |
| E2E-012 | Existing chat regression | attachment chips, image timeline, artifact panel, document search, chat reload continue to work. |

### 16.6 Performance/reliability tests

| ID | Area | Cases |
|---|---|---|
| PT-001 | List scale | 10,000 artifacts/user, indexed plan, p95 goal, payload bound. |
| PT-002 | Concurrent registration | replay/retry of same tool event and parallel distinct outputs. |
| PT-003 | Large content | max upload, large inline artifact guard, 512 KiB preview cap, streaming download. |
| PT-004 | Storage outage | list stays usable; preview/download/lifecycle fail explicitly and recover. |
| PT-005 | Database outage | no false success for registration/lifecycle; existing error conventions used. |

### 16.7 Repository checks

Run focused tests first, then the canonical quality gates from [Development principles](../docs/DEVELOPMENT_PRINCIPLES.md): typecheck, lint, unit tests, check, and `git diff --check`. Inspect any changes made by the formatter/check command.

### 16.8 Production acceptance

On a production-like or approved production account containing non-sensitive fixtures:

1. Upload one image, one PDF/text document, and create one code/text artifact and one generated image in different chats/projects.
2. Confirm all four appear in Library with correct owner, type, date, chat, project, and source-turn links.
3. Search filename and supported content; apply combined type/project/date filters.
4. Preview and download each supported artifact; compare downloaded bytes/content to the source fixture.
5. Hide and restore one artifact.
6. Delete one disposable blob backing; verify the Library and source chat show a tombstone and the chat itself still exists.
7. Remove a backing file out of band in a disposable environment; verify missing reconciliation.
8. Attempt a cross-user artifact URL/ID from a second account and confirm denial/no metadata leak.
9. Re-run backfill and confirm zero duplicates.
10. Check structured logs/metrics for expected success/failure counters and absence of sensitive content.

Health 200 responses alone do not satisfy production acceptance.

### When model evals apply

**Model-level evals are applicable only to the changed artifact-producing tool contract, not to Library browsing/search/filtering itself.**

Rationale:

- Library inventory, authorization, migration, filtering, previews, downloads, and lifecycle behavior are deterministic application/database/storage concerns and are better covered by unit, integration, security, migration, browser, and production tests.
- If implementation changes `agent/tools/artifact.ts`, `agent/tools/generate_image.ts`, tool descriptions, agent instructions, or the model-visible output schema to register/return artifact IDs, existing tool-selection behavior could regress. Those changes require focused Eve evals.
- Adding only the Library page and API does not require an eval if model-visible behavior and artifact-producing tool contracts remain unchanged.

Required eval plan if tool/model-visible contracts change:

| Eval ID | Fixture/prompt | Expected outcome | Pass threshold |
|---|---|---|---|
| EV-001 | “Create a complete downloadable Markdown report…” | Calls `artifact`; output/registration contains complete content, normalized format, and a usable artifact identity; final answer presents it. | 100% across 3 deterministic/retried runs, with no fenced-code-only substitution. |
| EV-002 | “Generate an image of a lighthouse…” | Calls `generate_image`; successful output is registered and returned/rendered as an artifact. | 100% across 3 runs when the configured image backend succeeds. |
| EV-003 | Quarterly revenue chart request | Does not route to `generate_image`; preserves existing chart/tool boundary. | 100% across 3 runs. |
| EV-004 | Ordinary prose answer with no requested deliverable | Does not create a spurious artifact record/tool call. | At least 95% across a 20-prompt negative fixture set; zero cross-user/ownership fields in tool input. |
| EV-005 | Tool registration/storage failure fixture | Model/user-visible response reports the failure and does not claim a downloadable Library artifact exists. | 100% across injected failure cases. |

Reuse and extend `evals/image-generation.eval.ts` when useful. Add artifact-tool eval coverage only if its model-visible contract changes. Eval fixtures must not use production secrets or personal files.

### Ordered implementation tasks (planning only)

These are proposed implementation tasks to derive into the agent TODO list **only after explicit PRD approval**.

1. **Resolve approval-blocking open questions.** Lock data duplication/search-vector policy, legacy route behavior, and source-turn locator format.
2. **Add test fixtures and schema migration tests.** Create representative documents/events/users/projects/storage files before implementation logic.
3. **Define artifact domain types and normalization.** Implement source kinds, media classes, availability, storage kinds, filename/MIME/language normalization, cursor/filter schemas, and unit tests (UT-001–UT-006, UT-008, UT-010, UT-012).
4. **Add additive artifact schema/migration.** Create table, constraints, indexes, relations, and migration verification (MT-001–MT-002).
5. **Implement ownership-scoped artifact repository.** Add registration/upsert, owned-artifact lookup, list/facets, search/filter/cursor logic, and integration/security tests (IT-001–IT-005, ST-001–ST-002, ST-007).
6. **Refactor local storage access behind artifact identity.** Add safe key extraction/resolution, streaming/range reads, availability checks, and deletion primitives (UT-009, IT-008–IT-011, ST-003–ST-005, ST-009).
7. **Implement artifact API routes.** Metadata/list/facets/detail/preview/download/hide/restore/delete-backing with typed errors and headers (FR-001–FR-007, FR-016–FR-023, FR-028–FR-033).
8. **Register uploads.** Integrate document creation/binding with artifact upsert while preserving attachment and RAG behavior (IT-004, IT-007, E2E-012).
9. **Register generated images and inline artifact-tool outputs.** Resolve authenticated Eve root session to owned chat/project, register stable source identity, and surface registration failures. Add required evals if model-visible contracts change (IT-004–IT-005, ST-008, EV-001–EV-005 as applicable).
10. **Implement centralized historical event extraction and backfill command.** Use `lib/chat-events.ts` predicates/parsers, deterministic batching/upsert, dry-run/report/recheck modes (UT-007, MT-003–MT-006, MT-008).
11. **Secure the legacy file route.** Replace unguessability-only access with authenticated artifact ownership resolution while preserving registered historical links (IT-011, ST-003).
12. **Build Library navigation/page/query UI.** Sidebar placement, server page, URL-backed filters/search, cards, pagination, states, responsive/accessibility behavior (E2E-001–E2E-003, E2E-008–E2E-010).
13. **Build detail previews and downloads.** Reuse safe existing artifact renderers, add PDF/unsupported fallbacks, bounded content fetch, focus management (E2E-004–E2E-005, ST-006).
14. **Add source-turn navigation.** Stable query/fragment locator, chat scroll/highlight/fallback, ownership checks (UT-011, E2E-006).
15. **Update chat artifact/attachment/image rendering for availability.** Ensure stale URLs defer to registered artifact state and show tombstones (IT-012, E2E-007, E2E-012).
16. **Add lifecycle UI.** Hide/restore/delete-backing confirmations and explicit results; verify no source-chat deletion (IT-006–IT-009, E2E-007).
17. **Add observability and operator documentation.** Structured counters, backfill runbook, migration/backup/rollback instructions, sensitive-log tests (ST-010, PT-004–PT-005).
18. **Run focused and full verification.** Complete the entire test/eval matrix, standard repository gates, migration restore/rollback, and browser checks.
19. **Deploy in the approved order and run production acceptance.** Preserve previous image and coordinated backups; validate real flows and backfill idempotency before declaring completion.

### requirement-to-test traceability

| Requirement group | Primary tests/evals |
|---|---|
| FR-001–FR-007 (inventory/query) | UT-003–UT-005, IT-001–IT-003, E2E-001–E2E-003, PT-001 |
| FR-008–FR-015 (registration/discovery) | UT-001–UT-002, UT-007, IT-004–IT-005, MT-003–MT-006, ST-008, PT-002, EV-001–EV-005 when applicable |
| FR-016–FR-023 (preview/download/file route) | UT-006, UT-009–UT-010, IT-008–IT-011, ST-003–ST-006, E2E-004–E2E-005, PT-003–PT-004 |
| FR-024–FR-027 (provenance/chat rendering) | UT-011, IT-006, IT-012, E2E-006, E2E-012 |
| FR-028–FR-033 (lifecycle/availability) | UT-008, UT-012, IT-006–IT-009, ST-009, E2E-007–E2E-008 |
| FR-034–FR-038 (migration/operations) | MT-001–MT-008, PT-004–PT-005, production acceptance 8–10 |
| NFR-001, NFR-009 (authorization/isolation) | ST-001–ST-009, E2E-011 |
| NFR-002, NFR-012 (privacy/operability) | ST-010, backfill reports, production acceptance 10 |
| NFR-003–NFR-005 (performance/payload/scale) | IT-002, IT-010, MT-008, PT-001, PT-003 |
| NFR-006, NFR-010–NFR-011 (reliability/compatibility/integrity) | IT-004, IT-006–IT-012, MT-006–MT-007, E2E-007, E2E-012, PT-002–PT-005 |
| NFR-007–NFR-008 (accessibility/responsive) | E2E-009–E2E-010 |
| US-001 | E2E-001 |
| US-002 | IT-002, MT-003–MT-006, E2E-002, E2E-008 |
| US-003 | UT-005, IT-003, ST-007, E2E-003 |
| US-004 | UT-004, IT-003, E2E-003 |
| US-005 | UT-006, ST-006, E2E-004, E2E-009–E2E-010 |
| US-006 | UT-010, IT-010, ST-002–ST-005, E2E-005 |
| US-007 | UT-011, IT-006, E2E-006 |
| US-008 | UT-012, IT-007, E2E-007 |
| US-009 | UT-008–UT-009, IT-006, IT-009, ST-009, E2E-007 |
| US-010 | UT-008, IT-008, E2E-008, PT-004 |
| US-011 | UT-002, IT-004–IT-005, ST-008, PT-002, EV-001–EV-005 if applicable |
| US-012 | MT-001–MT-008 |

## Acceptance criteria

### user stories and acceptance criteria

### US-001: navigate to the library

**Description:** As a signed-in user, I want a Library destination in the main sidebar so I can reach artifacts from anywhere in the app.

**Acceptance criteria:**

- [ ] Library appears immediately below Lookouts and above MCP Servers.
- [ ] `/library` is active for `/library` and nested Library routes only.
- [ ] Collapsed sidebar shows the Library tooltip and icon.
- [ ] Anonymous access redirects to sign-in through the authenticated app shell.
- [ ] Keyboard and screen-reader navigation expose an unambiguous “Library” link.
- [ ] Browser verification covers expanded/collapsed and desktop/narrow layouts.

### US-002: browse all supported artifacts

**Description:** As a signed-in user, I want one inventory of artifacts across chats so I do not need to remember their source thread.

**Acceptance criteria:**

- [ ] Uploaded images/documents, generated images, and code/text artifact tool outputs appear after registration/backfill.
- [ ] Processing/error upload rows appear with their actual state.
- [ ] Failed tool calls with no delivered artifact do not appear.
- [ ] The default list is newest first and paginates stably with no duplicates/skips.
- [ ] Empty, loading, error, and no-results states are distinct and actionable.
- [ ] Full artifact content is not embedded in the list response.
- [ ] Browser verification covers populated, empty, long-title, missing-file, and narrow-screen states.

### US-003: search artifacts

**Description:** As a user, I want to search filenames/titles and supported content so I can find an artifact by what it is called or contains.

**Acceptance criteria:**

- [ ] Search is case-insensitive and user-scoped.
- [ ] Filename/title matches work for every artifact type.
- [ ] Extracted upload text and inline artifact content are searchable when indexed.
- [ ] Generated-image prompts are searchable; raw binary pixels are not.
- [ ] Binary artifacts without `searchText` are labelled as not content-searchable.
- [ ] Search terms are length-limited, normalized, parameterized, and do not appear in server logs.
- [ ] Search combines with every filter and resets pagination.
- [ ] Browser verification covers matches, no matches, special characters, and cleared search.

### US-004: filter artifacts

**Description:** As a user, I want type, chat, project, date, and visibility filters so I can narrow a large Library.

**Acceptance criteria:**

- [ ] Type, chat, project, date, and visibility filters match Section 5.5.
- [ ] Filters compose with AND semantics; options within a single selector follow the selector's stated single-value behavior.
- [ ] Active filters are visible and removable individually or with “Clear all.”
- [ ] Filter/search state survives refresh and browser back/forward navigation through URL parameters.
- [ ] Chat/project option queries include only the signed-in user's records.
- [ ] Deleted/unavailable provenance can be filtered explicitly.
- [ ] Browser verification covers each filter alone, combined filters, custom date boundaries, and no-results states.

### US-005: preview an artifact safely

**Description:** As a user, I want a safe preview and metadata before downloading so I can confirm an artifact is the one I need.

**Acceptance criteria:**

- [ ] Each supported type follows Section 6.4.
- [ ] HTML/SVG previews cannot access the parent origin's DOM, cookies, local storage, or authenticated APIs.
- [ ] The list response stays metadata-only; preview content is fetched on demand.
- [ ] Oversized text previews are truncated with a visible message and download action.
- [ ] Unsupported binary formats receive a useful metadata/icon preview, not a broken renderer.
- [ ] Missing/deleted/error artifacts display explicit states.
- [ ] Preview controls are keyboard-operable, labelled, focus-managed, and respect reduced-motion preferences.
- [ ] Browser verification covers every preview class and failure state.

### US-006: download an artifact

**Description:** As a user, I want to download an available artifact with its expected filename and type.

**Acceptance criteria:**

- [ ] Every authorized available artifact has a download action.
- [ ] The response uses an attachment `Content-Disposition` with a sanitized UTF-8 filename and the stored/derived MIME type.
- [ ] Blob-backed downloads stream from local storage rather than loading the entire file into application memory.
- [ ] Inline text artifacts download through an authorized server response, not only an ephemeral browser reconstruction.
- [ ] Missing/deleted backing returns an explicit 410-style unavailable response and updates/reconciles the artifact status.
- [ ] Another user cannot download the artifact by knowing its UUID, storage key, old blob URL, or source chat ID.

### US-007: return to the source chat and turn

**Description:** As a user, I want to open the chat and turn that produced an artifact so I can recover its context.

**Acceptance criteria:**

- [ ] Available source links open only user-owned chats.
- [ ] Uploaded artifacts target the bound user turn; tool outputs target the producing assistant tool call/event.
- [ ] The target scrolls into view and receives a temporary accessible highlight/focus treatment.
- [ ] Missing exact-turn provenance falls back gracefully with a notice.
- [ ] A deleted source chat is shown as unavailable and is not linked.
- [ ] No Library response leaks another user's chat/project title or ID.

### US-008: hide and restore an artifact

**Description:** As a user, I want to remove clutter from my default Library without deleting the chat or content.

**Acceptance criteria:**

- [ ] “Remove from Library” requires a clear confirmation of its non-destructive effect.
- [ ] The action sets `libraryHiddenAt` and removes the artifact from the default Active view.
- [ ] Hidden artifacts appear in the Hidden view and can be restored.
- [ ] Hiding/restoring does not change the source chat, chat events, document search eligibility, or backing file.
- [ ] Concurrent/repeated hide or restore requests are idempotent.

### US-009: delete a backing file safely

**Description:** As a user, I want to delete a stored binary file without deleting the source chat so I can manage retained data safely.

**Acceptance criteria:**

- [ ] The action is available only for byte/blob-backed artifacts and requires an irreversible-action confirmation naming the consequence.
- [ ] The server verifies ownership before resolving or deleting any storage path.
- [ ] The file is deleted best-effort, and the database records `availability=deleted`, `deletedAt`, and a non-sensitive failure state if storage deletion fails.
- [ ] Metadata and provenance remain as a tombstone; source chat/project rows are unchanged.
- [ ] Chat and Library renderers show an explicit deleted/unavailable state and do not continue to use a stale event URL.
- [ ] Repeating deletion is safe and does not affect any other artifact, even if historical data contains a duplicate URL.
- [ ] Deleting an inline-only code/text artifact is not offered in this release.

### US-010: handle missing or expired backing files

**Description:** As a user, I want a clear explanation when a backing file is unavailable so I do not see unexplained broken entries.

**Acceptance criteria:**

- [ ] Preview/download detects missing storage and returns a typed unavailable response.
- [ ] The artifact transitions to `availability=missing` through an idempotent reconciliation update.
- [ ] The UI distinguishes processing, generation/upload error, missing, expired, and user-deleted states where the source data can distinguish them.
- [ ] Operators receive aggregate missing-backing telemetry without path/filename leakage.
- [ ] A later repaired/restored file can be reconciled back to available by an operator-supported recheck path or backfill rerun.

### US-011: register new artifacts at creation time

**Description:** As a developer integrating an artifact-producing flow, I want one registration contract so every new artifact becomes discoverable and authorized consistently.

**Acceptance criteria:**

- [ ] Upload completion, image generation, and artifact-tool completion write/upsert an artifact row with authenticated `userId`, source provenance, media metadata, and storage/content reference.
- [ ] Registration is idempotent on a stable source identity.
- [ ] No tool trusts a model-supplied user ID, chat ID, project ID, storage key, or ownership field.
- [ ] Future PDF/DOCX/PPTX/XLSX generators can use the same server-side registration function without schema changes.
- [ ] A registration failure is surfaced/observed and cannot silently produce a permanently undiscoverable “successful” output.

### US-012: backfill existing artifacts

**Description:** As an operator upgrading MiniScira, I want existing artifacts discovered safely so the new Library is complete on existing installations.

**Acceptance criteria:**

- [ ] An additive committed migration creates the schema/indexes without deleting or rewriting existing chat/document data.
- [ ] An explicit idempotent backfill registers existing `document` rows and successful `artifact`/`generate_image` outputs from persisted chat events.
- [ ] Backfill ownership comes from the owning chat/document, never event payload claims.
- [ ] Backfill stores checkpoints/progress or uses deterministic upserts so interruption and rerun are safe.
- [ ] Malformed events, foreign/non-local URLs, missing blobs, and duplicate tool events are counted and skipped/tombstoned without aborting the whole run.
- [ ] Running the backfill twice produces no duplicate artifact rows.
- [ ] Rollback steps and pre-migration database/uploads backup are documented and exercised.

## Deployment

### Migration and backfill

### Phase A: additive schema migration

1. Add the `artifact` table, constraints, and ownership/filter indexes.
2. Add only necessary nullable association columns to existing tables.
3. Do not drop `document`, `document_chunk`, event fields, or old file URLs.
4. Validate migration against a copy of the current schema and representative existing data.

### Phase B: application compatibility/write path

1. Add shared artifact registration/query/storage services.
2. Dual-read compatibility: existing chat rendering continues to understand legacy event/document records; Library reads artifact rows.
3. New uploads and successful artifact-producing tools register artifact rows immediately.
4. New preview/download URLs use ownership-checked artifact endpoints.
5. Keep legacy `/api/files/*` compatibility only behind authenticated ownership resolution to registered artifacts.

### Phase C: explicit idempotent backfill

Run a committed operator command/container task, not normal app startup:

1. **Documents:** batch by deterministic primary-key cursor. Upsert one artifact per `document.id`, derive ownership/provenance/status, and resolve the local storage key from the existing `blobUrl` only after validating it belongs to the configured local-file route.
2. **Tool events:** batch chats by ID and events by `(chatId, seq)`. Use centralized event predicates/parsers to find completed `artifact` and `generate_image` tool outputs. Derive owner/project from the user-owned chat, source identity from event/tool call metadata, and creation time from persisted event metadata/row time.
3. **Backing check:** optionally stat local blob keys in bounded concurrency. Mark absent files `missing`; do not fetch remote URLs.
4. **Malformed/duplicate handling:** record aggregate counters and continue. Unique source keys make reruns safe.
5. **Verification report:** total source candidates, inserted, already present, unavailable, malformed, unsupported foreign URLs, and conflicts; no sensitive names/content/paths.

### Phase D: enforcement

After backfill verification:

- stop emitting unauthenticated direct blob URLs;
- ensure all Library/chat preview/download paths use artifact authorization and state;
- retain the legacy route only as an authenticated compatibility resolver until historical references no longer require it.

### Migration verification

- Apply migration to an empty database and to a restored pre-feature database.
- Run dry-run and real backfill twice; second run must insert zero duplicates.
- Compare expected fixture source count to artifact count by source kind.
- Verify missing blobs produce tombstones, not backfill failure.
- Verify rollback on a database/uploads backup and preserve the previous application image.

### deployment and rollback

Follow the canonical [Deployment guide](../docs/DEPLOYMENT.md); this section records feature-specific gates only.

### 15.1 Before deployment

1. Back up Postgres and the uploads volume together.
2. Record the previous application image tag/immutable image ID.
3. Run migration tests on a restored production-like copy.
4. Run backfill dry-run and inspect aggregate candidate/unavailable/malformed counts.
5. Verify adequate database capacity for inline text artifacts and the search index. Uploads capacity does not change.

### 15.2 Deployment order

1. Deploy compatibility-capable application code that tolerates absent/unbackfilled artifact rows if required by the chosen migration ordering.
2. Apply the committed additive migration through the explicit migrate service.
3. Deploy/recreate the application image if not already done.
4. Run the explicit artifact backfill in bounded batches.
5. Verify counts, rerun idempotency check, then enable/enforce ownership-backed legacy file resolution.
6. Run production acceptance in Section 17.8.

The exact ordering must be tested for the final implementation. Do not create a window where old chats cannot render files or where `/api/files/*` becomes inaccessible before its references are registered.

### 15.3 Rollback

- Keep the artifact schema additive during the first rollback window so the previous image can ignore it.
- If application behavior fails before destructive lifecycle use, redeploy the previous image; artifact rows may remain inert.
- If users have deleted backing files after launch, code rollback cannot restore those bytes; restore the coordinated pre-deployment database/uploads backup only with explicit operator acceptance of losing post-backup changes.
- If migration/backfill corrupts associations or content, stop lifecycle mutations, restore the database and uploads backup together, redeploy the previous image, and retain failure logs without sensitive payloads.
- Do not drop the artifact table as an automated rollback step.

## Observability

### 14.1 Structured events and counters

Emit structured, non-sensitive telemetry for:

- `artifact.register` — source kind, media class, result (`inserted|existing|failed`), duration;
- `artifact.list` — filter classes used, result bucket, duration, status;
- `artifact.preview` and `artifact.download` — media class, availability, byte bucket, duration, status;
- `artifact.lifecycle` — action (`hide|restore|delete_backing`), result, duration;
- `artifact.reconcile` — transition (`available->missing`, etc.);
- `artifact.backfill.batch` and final summary — scanned/inserted/existing/malformed/unavailable/conflict counts;
- authorization rejection counts by route/action.

### 14.2 Operator checks and alerts

Document operator investigation thresholds rather than adding a new monitoring vendor:

- sustained registration failures;
- a backfill conflict/malformed rate above an agreed threshold;
- sudden missing-backing growth;
- elevated download/preview 5xx rate;
- migration failure or backfill interruption.

### 14.3 What health checks prove

Existing health endpoints prove process/database availability only. They do not prove Library authorization, backfill completeness, preview, download, storage, or source navigation. Production acceptance must exercise those real flows.

## Rollback

No separate rollback requirements were recorded.

## Open questions

### Open questions that need review

- **OQ-001 — Inline content source of truth:** Should new `artifact` tool content be stored only in `artifact.inlineContent` with events carrying an artifact ID, or duplicated in both event JSON and the artifact row for replay compatibility? Recommendation: during compatibility rollout, keep event output plus artifact row; establish artifact row as Library/download authority and revisit event payload compaction separately.
- **OQ-002 — Historical text deletion:** Is reversible “Remove from Library” sufficient for inline artifacts, or is permanent redaction required soon? Permanent redaction would need a separate transcript-retention PRD and is a non-goal here.
- **OQ-003 — Search text duplication:** Should uploaded `document.content` be copied into `artifact.searchText`, or should artifact search join/use `document.content` while inline/generated records store their own search text? Recommendation: avoid duplicating potentially large uploaded text; use a maintained artifact search vector populated from the source, while keeping `document.content` canonical.
- **OQ-004 — Legacy `/api/files/*` compatibility:** How long must historical URLs stay valid? Recommendation: retain an authenticated compatibility resolver for at least one release after verified backfill, then reassess based on stored event references.
- **OQ-005 — Generated image filename:** Should generated images display a prompt-derived filename or a neutral generated filename? Recommendation: neutral sanitized filename plus separate prompt metadata to avoid leaking prompt text in download headers.
- **OQ-006 — Custom date timezone:** Use browser-local timezone (recommended for immediate scope) or add a persisted user timezone setting? Persisted timezone is not currently part of user settings and should not be introduced only for this feature without broader review.
- **OQ-007 — Expired state source:** There is no current storage expiry mechanism. Keep `expired` reserved for future storage providers, while local missing files use `missing` and user deletion uses `deleted`.
- **OQ-008 — Backfill execution packaging:** Choose the repository-standard explicit Bun command versus a Compose profile one-shot service. Either must be restartable, documented, and never run during normal startup.
- **OQ-009 — Result counts:** Should the UI show exact total counts, which can make filtered queries more expensive, or only “showing N” plus Load more? Recommendation: avoid mandatory exact totals in the first release; facets/counts may be approximate or omitted if query plans regress.

### approval gate

This PRD remains **Draft — not approved**. Before implementation:

1. The user must explicitly approve this PRD and resolve approval-blocking open questions.
2. Record the approval in this PRD. Keep the backlog status `To do` until implementation starts.
3. Ordered atomic implementation TODOs must be derived from Section 18.
4. Every TODO must map to the requirements and exact tests/evals in Sections 16–19.
5. Only then may implementation begin under the canonical repository planning process.

No product code is implemented by this PRD.
