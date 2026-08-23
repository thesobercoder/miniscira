# PRD: native document generation (PDF, DOCX, PPTX, XLSX)

- **Status:** Draft — needs explicit user approval before implementation
- **Backlog source:** [`docs/PRODUCT_IDEAS.md` — Generate editable documents and presentations](../docs/PRODUCT_IDEAS.md#generate-editable-documents-and-presentations)
- **Repository:** `/opt/data/miniscira-src`
- **Related future work:** Artifact Library across all chats (not part of this PRD)
- **Planning rule:** This document defines the full backlog scope. It does not allow implementation.

## 1. Problem

MiniScira can create presentational text/code artifacts whose content lives in persisted Eve events, and `run_code` can save sandbox-generated chart images to durable local blob storage. It cannot produce a validated, durable binary office document as a stored chat result. Users who ask for a report, letter, deck, or workbook must currently copy content into another application and rebuild structure, styling, tables, charts, citations, and metadata manually.

Add one agent-facing document-generation capability that creates PDF, DOCX, PPTX, and XLSX files inside the existing isolated Docker Sandbox, validates them before release, stores the accepted bytes durably, records user/chat/turn provenance in Postgres, and presents a preview or structured summary plus a direct download in the originating conversation.

DOCX, PPTX, and XLSX must remain native, editable Office Open XML documents rather than screenshots or a collection of flattened images. PDF is the fixed layout delivery format and is not required to be natively editable. All formats must be macro-free.

## 2. Current repository facts

The implementation must preserve these existing contracts:

- `agent/sandbox.ts` provides an Eve Docker Sandbox and bootstraps Python with `pandas`, `numpy`, and `matplotlib`.
- `agent/tools/run_code.ts` demonstrates user-scoped input staging, Sandbox binary reads/writes, durable upload through `lib/local-blob.ts`, and timeline output containing generated image URLs.
- The Sandbox has default-deny network policy and only allowlisted proxy egress. Document generation must not require arbitrary Internet access.
- `/data/uploads` is the durable upload/generated-file volume in Docker deployments and is included with Postgres in backup/restore guidance.
- `lib/local-blob.ts` flattens attacker-controlled path names and writes bytes to durable local storage.
- `app/api/files/[...path]/route.ts` serves random-suffix URLs without row-level authorization. Generated documents require an authenticated, owner-checked download path; unguessable URLs alone are not sufficient authorization for this feature.
- `lib/db/schema.ts` has a `document` table for user uploads, but no generated-artifact entity. The existing row semantics (`kind`, upload processing, extracted content) do not fully represent generated artifact provenance, validation, preview, failure, or lifecycle.
- `agent/tools/artifact.ts` is display-only and writes nothing to disk. Its current browser download reconstructs text from an event and is not a durable binary-file path.
- `components/chat/assistant-turn.tsx` lifts `artifact` tool calls out of the research timeline and renders them as deliverables. The new binary document result should follow this prominence but use a distinct typed tool/result contract.
- `components/research-chat.tsx` rehydrates ordinary artifacts from persisted Eve events. Durable binary artifacts must also survive event compaction, schema evolution, file lifecycle changes, and a page reload through a database-backed record.
- `docs/ENGINEERING_INVARIANTS.md` requires attachment object-URL cleanup and data URLs for model-facing private-host files. Generated downloads are user-facing links and must not be automatically inlined into later model calls.
- `docs/UMBREL_SANDBOX_OPERATIONS.md` requires exact Sandbox file-write and execution proof and strict network/container isolation. A generation acceptance test must prove binary archive transfer, not only successful Python process startup.

## 3. goals

1. Generate each of `.pdf`, `.docx`, `.pptx`, and `.xlsx` from a natural-language chat request.
2. Preserve real editability in DOCX, PPTX, and XLSX using native OOXML structures.
3. Support deterministic templates, useful document structure, tables, charts, citations, and standard metadata where applicable.
4. Generate and validate every file inside the existing isolated Sandbox before storing or exposing it.
5. Persist accepted artifact bytes and provenance durably with the chat and originating assistant turn.
6. Show generation progress in the research timeline and a prominent completed-artifact card in stream order.
7. Provide a safe preview when supported and always provide a concise structured summary before download.
8. Enforce strict per-user authorization for metadata, preview, and download.
9. Fail clearly and retain diagnostic evidence without presenting corrupt or unvalidated output as complete.
10. Define format-specific tests and model/tool evals that catch technically valid but unusable documents.

## 4. non-goals

- Editing an existing PDF/DOCX/PPTX/XLSX through chat in the first implementation.
- Collaborative real-time office editing in MiniScira.
- Building the cross-chat Artifact Library; this PRD creates a compatible artifact record for that future feature.
- Supporting legacy binary `.doc`, `.ppt`, or `.xls` formats.
- Macro-enabled `.docm`, `.pptm`, or `.xlsm` files, VBA, add-ins, ActiveX, external data connections, or embedded executable objects.
- Password-protected/encrypted output in the first implementation.
- Pixel-perfect parity with Microsoft Office on every platform or font installation.
- Guaranteed PDF/A, PDF/UA, WCAG certification, or legally compliant accessible documents in the first release. The feature must apply the accessibility basics specified here and report limitations.
- Arbitrary user-supplied executable templates, template scripts, or remote template URLs.
- Arbitrary package installation at generation time.
- Exposing library/provider/runtime choices to ordinary users.
- Replacing the current uploaded-document model or text/code artifact tool.
- Automatic deletion of artifacts when a source chat is archived. Chat deletion semantics are an open dependency and must be explicitly implemented/tested before release.

## 5. users and primary use cases

### US-001: generate a fixed layout PDF report

**Description:** As a user, I want MiniScira to create a polished PDF report so I can distribute a stable document without rebuilding the answer manually.

**Acceptance criteria:**

- [ ] A request explicitly asking for PDF causes the document-generation tool to run once for a single logical deliverable.
- [ ] The delivered filename ends in `.pdf`, MIME type is `application/pdf`, and the first five bytes are `%PDF-`.
- [ ] The PDF opens in at least two independent validators/renderers selected in the test plan.
- [ ] Text intended as text is selectable/extractable and is not a page-sized screenshot.
- [ ] Requested headings, paragraphs, tables, charts, citations, page numbers, and metadata are present when applicable.
- [ ] The UI shows page count, file size, generation/validation status, a preview, and download.
- [ ] Reloading the chat preserves the artifact card and download.
- [ ] Typecheck/lint/tests pass and the real flow is verified in a browser.

### US-002: generate an editable DOCX

**Description:** As a user, I want an editable Word document so I can continue revising prose, tables, and citations in an office editor.

**Acceptance criteria:**

- [ ] The filename ends in `.docx` and MIME type is `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
- [ ] The file is a valid ZIP/OOXML package containing `[Content_Types].xml`, `_rels/.rels`, and `word/document.xml`.
- [ ] Headings are Word paragraph styles, paragraphs remain text, tables are Word tables, and charts/images are separate drawing parts rather than a flattened page image.
- [ ] Requested headers/footers, page numbering, section/page breaks, citations, references, and metadata are present where applicable.
- [ ] The document opens without repair warnings in LibreOffice and at least one second OOXML validator/editor in the test matrix.
- [ ] A user can edit a paragraph and a table cell and save the result in the manual acceptance test.
- [ ] The UI shows a generated preview or page thumbnails derived from a validated conversion plus a summary and download.
- [ ] Reloading the chat preserves the artifact card and download.
- [ ] Typecheck/lint/tests pass and the real flow is verified in a browser.

### US-003: generate an editable PPTX

**Description:** As a user, I want an editable slide deck so I can revise slide text, layouts, tables, and charts after generation.

**Acceptance criteria:**

- [ ] The filename ends in `.pptx` and MIME type is `application/vnd.openxmlformats-officedocument.presentationml.presentation`.
- [ ] The file is a valid ZIP/OOXML package containing `[Content_Types].xml`, `_rels/.rels`, and `ppt/presentation.xml`.
- [ ] Slide titles and body copy remain text shapes; tables remain table objects; supported charts remain chart objects or editable chart data, except documented fallback cases.
- [ ] Each slide uses a known template layout and remains within configured overflow/collision thresholds.
- [ ] Speaker notes, citations, alt text, slide title metadata, and deck metadata are included when requested/applicable.
- [ ] The deck opens without repair warnings in LibreOffice Impress and at least one second OOXML validator/editor in the test matrix.
- [ ] A user can edit a title, move a shape, and edit a table or chart data point and save the result in the manual acceptance test.
- [ ] The UI shows slide count, file size, thumbnails or a validated PDF preview, summary, and download.
- [ ] Reloading the chat preserves the artifact card and download.
- [ ] Typecheck/lint/tests pass and the real flow is verified in a browser.

### US-004: generate an editable XLSX

**Description:** As a user, I want an editable workbook so I can inspect formulas, revise data, and continue analysis in a spreadsheet application.

**Acceptance criteria:**

- [ ] The filename ends in `.xlsx` and MIME type is `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- [ ] The file is a valid ZIP/OOXML package containing `[Content_Types].xml`, `_rels/.rels`, and `xl/workbook.xml`.
- [ ] Data remains typed cells, formulas remain formulas, tables use worksheet table ranges where requested, and supported charts remain spreadsheet chart objects.
- [ ] The workbook has sensible sheet names, frozen panes, filters, widths, number formats, and print settings where applicable.
- [ ] Formula cells do not contain Excel error values in the validated fixture set, and formula text is inspectable even when the writer cannot calculate cached values.
- [ ] The workbook opens without repair warnings in LibreOffice Calc and at least one second OOXML validator/editor in the test matrix.
- [ ] A user can edit an input cell, inspect a formula, alter a table row, and save the result in the manual acceptance test.
- [ ] The UI shows sheet names/dimensions, file size, a safe table/chart preview or structured workbook summary, and download.
- [ ] Reloading the chat preserves the artifact card and download.
- [ ] Typecheck/lint/tests pass and the real flow is verified in a browser.

### US-005: choose and apply a safe template

**Description:** As a user, I want an appropriate visual template selected automatically so the output is coherent without exposing implementation controls.

**Acceptance criteria:**

- [ ] The tool accepts a stable template ID, not an arbitrary filesystem path or URL.
- [ ] Initial built-in templates include at least `professional-report`, `simple-letter`, `research-brief`, `presentation-standard`, and `workbook-analysis` where formats apply.
- [ ] If the user does not specify a style, the agent selects the most specific built-in template.
- [ ] A missing/incompatible template fails before generation with a user-readable error.
- [ ] Template versions are recorded on the artifact row for reproducibility.
- [ ] Templates contain no macros, external links, executable content, or hidden secrets.

### US-006: include tables, charts, citations, and metadata

**Description:** As a user, I want structured evidence and data represented natively so the document remains useful after download.

**Acceptance criteria:**

- [ ] The generation specification distinguishes prose, headings, lists, tables, charts, citations, references, and metadata rather than passing only unconstrained source code.
- [ ] Table cells preserve text/numeric/date types where the target format supports them.
- [ ] Charts include a title, series labels, axis labels where applicable, and accessible alternative text or an adjacent textual summary.
- [ ] Research citations retain source URL, title when known, and a stable in-document reference marker.
- [ ] A references section or references slide/sheet is included when sources are used.
- [ ] Standard metadata includes title, subject/description, author=`MiniScira` unless the user requests another value, keywords when supplied, creation timestamp, format, generator version, and template version where the container permits it.
- [ ] User-provided metadata is length-limited and XML/control-character sanitized.

### US-007: preview and summarize the result

**Description:** As a user, I want to inspect what was generated before downloading so I can catch missing sections or obvious formatting limitations.

**Acceptance criteria:**

- [ ] No artifact is marked `ready` until primary validation succeeds.
- [ ] Every ready artifact has a structured summary containing format, filename, size, page/slide/sheet count, section/sheet names where applicable, included charts/tables, citation count, template, and validation warnings.
- [ ] PDF preview uses the validated stored PDF and is rendered in a sandboxed/no-script context.
- [ ] DOCX/PPTX preview comes from a Sandbox conversion to PDF or thumbnails on the server and never executes active content.
- [ ] XLSX preview uses sanitized server-produced JSON/HTML or static images for bounded worksheet ranges/charts; it does not embed an office document in an executable browser context.
- [ ] If preview conversion fails but the native file passes primary validation, the artifact may be delivered with an explicit `Preview unavailable` warning and complete summary.
- [ ] Preview assets are owner-authorized and durable or deterministically regenerable.
- [ ] The UI handles loading, ready, warning, failed, missing-file, and narrow-screen states.

### US-008: Preserve durable chat provenance

**Description:** As a user, I want generated files to stay attached to the chat and turn that created them so I can retrieve them later.

**Acceptance criteria:**

- [ ] A generated-artifact database row records owner, chat, originating assistant turn/tool call, filename, format, MIME type, byte size, blob identity, checksum, template/version, status, summary, validation report, preview references, and timestamps.
- [ ] The row is created in `generating` state before lengthy generation and transitions through documented states atomically.
- [ ] A chat reload fetches artifact rows under user authorization and renders them in transcript order even if the Eve event payload is compacted or its output shape evolves.
- [ ] Artifact bytes survive app container recreation because they live in the durable uploads volume.
- [ ] Database backup plus uploads-volume backup is sufficient to restore the artifact and its provenance.
- [ ] A missing backing file renders `File missing` with provenance intact; it never becomes a broken silent link.
- [ ] The schema is compatible with a future cross-chat Artifact Library without implementing that UI now.

### US-009: generate and validate in the isolated Sandbox

**Description:** As an operator, I want document creation isolated from the app process so malformed inputs and rendering libraries do not weaken the host application.

**Acceptance criteria:**

- [ ] Generation, conversion, and binary validation run in an Eve Sandbox session, not in the Next.js process.
- [ ] Inputs staged into the Sandbox are explicitly selected, user-owned, size-limited, and copied to sanitized filenames.
- [ ] The tool uses a per-call working directory and only reads declared output/preview/report paths.
- [ ] Generation succeeds with no Internet access; no arbitrary remote assets are fetched.
- [ ] Process time, stdout/stderr, output bytes, file count, page/slide/sheet counts, and archive expansion are bounded.
- [ ] Failed validation prevents durable publication as a ready artifact.
- [ ] The exact Sandbox acceptance proves text and binary writes, generation, binary read-back, validation, upload, download, and cleanup with no lingering `cat` process.

### US-010: enforce owner-only access

**Description:** As a user, I want only my authenticated account to access my generated documents and previews.

**Acceptance criteria:**

- [ ] Metadata, download, preview, retry, and deletion endpoints require authentication and scope by `artifact.userId`.
- [ ] Requests for another user's artifact return the repository-standard non-disclosing response (`404` unless a canonical API rule requires otherwise).
- [ ] Downloads are served from an opaque artifact ID route after ownership lookup; the raw local-blob URL/path is not the authorization boundary.
- [ ] Responses set `Content-Type`, safe `Content-Disposition`, `X-Content-Type-Options: nosniff`, private cache policy, and a restrictive CSP where browser rendering applies.
- [ ] Filenames cannot inject headers or escape storage/workspace paths.
- [ ] Authorization tests cover a second user for every artifact endpoint and preview asset.

## 6. functional requirements

### Generation contract

- **FR-001:** Add a dedicated agent tool, temporarily named `generate_document`, for the four supported formats.
- **FR-002:** The tool input must be a versioned, Zod-validated document specification, not arbitrary executable Python/JavaScript supplied directly by the model.
- **FR-003:** The first schema version must include: `format`, `title`, `filename`, `templateId`, `metadata`, ordered content blocks, source references, and format-specific options.
- **FR-004:** Content blocks must support at minimum headings, paragraphs, bullet/numbered lists, tables, images/charts, citations, references, page/section breaks, and callouts where the target supports them.
- **FR-005:** Chart specifications must support at minimum bar, line, pie/donut, and scatter charts with typed data and labels. Unsupported chart types must be rejected or explicitly degraded with a warning.
- **FR-006:** The tool must reject unknown formats, over-limit specifications, unsupported template IDs, malformed tables/charts, unsafe control characters, and invalid filenames before opening a Sandbox.
- **FR-007:** One tool call produces one primary artifact. Multiple requested files require multiple explicit tool calls so progress, failure, and provenance remain independent.
- **FR-008:** The tool must surface explicit phases: preparing, generating, validating, previewing, storing, ready/failed.
- **FR-009:** Generation must be deterministic for the same normalized specification, template version, generator version, and fixed timestamp inputs except where OOXML libraries inject non-semantic package IDs.

### Format acceptance

- **FR-010 (PDF):** Output extension `.pdf`; MIME `application/pdf`; PDF header/trailer parse successfully; no encryption; no embedded files, JavaScript, launch actions, or external actions; page count `1..200`; text extraction succeeds for text-bearing fixtures; every page renders without parser errors.
- **FR-011 (DOCX):** Output extension `.docx`; exact DOCX MIME; valid ZIP with required OOXML parts; no `vbaProject.bin`, OLE objects, ActiveX, attached packages, remote relationships, external template, or DDE field instructions; document opens without repair; paragraphs/tables/drawings remain native objects.
- **FR-012 (PPTX):** Output extension `.pptx`; exact PPTX MIME; valid ZIP with required OOXML parts; no VBA/OLE/ActiveX/attached packages/remote relationships; slide count `1..100`; opens without repair; titles/body/tables remain native objects and supported charts remain chart objects.
- **FR-013 (XLSX):** Output extension `.xlsx`; exact XLSX MIME; valid ZIP with required OOXML parts; no VBA/OLE/ActiveX/external workbook links/data connections/query tables/DDE; sheet count `1..50`; bounded rows/columns/cells; opens without repair; values/formulas/tables/charts remain native spreadsheet objects.
- **FR-014:** All OOXML output must reject ZIP path traversal, duplicate critical entries, encrypted members, compression bombs, and archive expansion above configured limits.
- **FR-015:** Validation must compare requested format/extension/MIME with detected file signature and package structure; a renamed or mismatched file fails.
- **FR-016:** Default limits must be operator-configurable, with initial product defaults: source specification 2 MiB JSON, output 50 MiB, preview bundle 25 MiB, PDF 200 pages, DOCX 200 rendered pages, PPTX 100 slides, XLSX 50 sheets/200,000 populated cells, 25 charts, and 60-second generation plus 60-second validation/conversion per phase. Final defaults require performance measurement before approval for production.

### Templates and layout

- **FR-017:** Built-in templates are versioned repository assets and selected by stable ID.
- **FR-018:** Templates must define format applicability, theme tokens, page/slide size, fonts, color palette, margins, header/footer rules, and layout constraints.
- **FR-019:** The base image must include a documented, redistributable font set; generation must not depend on fonts installed on the user's device.
- **FR-020:** Missing glyphs/font substitutions and overflow detected during preview conversion must be reported as warnings or failures according to severity.
- **FR-021:** PPTX layout validation must detect out-of-slide bounds and materially overlapping text/shape boxes. DOCX/PDF validation must flag blank pages and clipped/overflowing render output where measurable. XLSX must flag truncated headers or unreadably narrow default columns in fixtures.

### Citations and metadata

- **FR-022:** The agent must pass citations as structured records with stable IDs, title, URL, access/published date when known, and optional author/publisher; generators must not parse citation truth from free-form prose.
- **FR-023:** Citation markers and reference entries must round-trip consistently: every marker resolves to exactly one reference, every used reference appears once, and unused references generate a warning.
- **FR-024:** URLs must be displayed as text/hyperlinks but never fetched during generation or preview.
- **FR-025:** Standard metadata must be set in target-format properties where supported and duplicated into the artifact database record.

### Durable storage and API

- **FR-026:** Introduce a generated-artifact table rather than overloading uploaded `document` rows. The entity must be general enough for future generated images/research exports but this implementation migrates only the new document formats unless separately approved.
- **FR-027:** The artifact state machine must be explicit: `generating -> validating -> previewing -> ready_with_warnings|ready`, with terminal `failed` and `missing` derived when backing bytes disappear. Invalid transitions fail loudly.
- **FR-028:** Store a SHA-256 checksum of primary bytes and preview assets; verify checksum on validation completion and optionally on download/periodic integrity checks.
- **FR-029:** Persist artifact metadata and blob publication consistently. If blob upload succeeds but database finalization fails, delete or queue cleanup of the orphan. If DB finalization succeeds but the blob later disappears, show `missing`.
- **FR-030:** Store files under an owner-scoped generated-artifact prefix with random storage identity; retain the sanitized display filename separately.
- **FR-031:** Add authenticated endpoints for listing artifacts by chat, reading metadata, downloading primary bytes, serving preview assets, and deleting/retrying where approved.
- **FR-032:** A completed result must include an opaque artifact ID, not a raw filesystem path. Tool output may include summary metadata but must not duplicate file bytes/base64 in persisted Eve events.
- **FR-033:** Chat rendering must merge persisted event position with database artifact rows using the originating tool call/assistant turn identity and avoid duplicate cards.
- **FR-034:** Download must stream bytes and support a safe `Content-Disposition: attachment; filename*=UTF-8''...` value. PDF preview may use `inline`; Office files must default to attachment.

### Preview and user experience

- **FR-035:** Add a distinct timeline/document node for in-progress phases and errors; completed document cards render as result blocks, not collapsed research steps.
- **FR-036:** The completed card must show filename, format badge, file size, page/slide/sheet count, validation status/warnings, template, preview/summary affordance, and download.
- **FR-037:** The artifact detail panel must support binary-document summary/preview without attempting to syntax-highlight or reconstruct binary content in the browser.
- **FR-038:** DOCX/PPTX previews should use headless LibreOffice conversion to PDF followed by bounded PDF thumbnail/render extraction if feasibility and image size are acceptable. The primary native file remains authoritative.
- **FR-039:** XLSX preview should use generator-emitted normalized preview data and static chart images, capped to configured rows/columns. LibreOffice PDF conversion may be an additional preview but is not the only workbook inspection surface.
- **FR-040:** Preview warnings must be visible before download and repeated in accessible text, not conveyed by color alone.
- **FR-041:** If a user requested a feature unsupported by the chosen library/format, the final assistant response and artifact summary must name the specific limitation.

### Accessibility

- **FR-042:** Templates must use logical heading levels, readable font sizes/contrast, table header rows, descriptive chart titles, and alt text for meaningful images/charts where target libraries support it.
- **FR-043:** Decorative images should be marked decorative where supported; otherwise the limitation must be documented.
- **FR-044:** PPTX slides must have non-empty titles or explicit accessibility labels; XLSX sheets must have meaningful names and tables must have headers.
- **FR-045:** Automated checks cover presence of structural accessibility metadata. Manual tests cover keyboard access and screen-reader labels in MiniScira's artifact UI. The product must not claim formal accessibility conformance without a separate audit.

### Failure, retry, observability, lifecycle

- **FR-046:** A failed generation must record a bounded, sanitized error category and phase; raw document contents, secrets, and full model specifications must not be logged.
- **FR-047:** Retry creates a new generation attempt and may reuse the same artifact request identity, but must never silently overwrite a previously ready file. Versioning semantics must be visible.
- **FR-048:** Metrics/logs must capture format, template ID/version, phase durations, byte size, page/slide/sheet counts, warning/error category, library/generator version, Sandbox/session correlation ID, and success/failure—without user content.
- **FR-049:** Operators must identify orphaned blobs, stuck nonterminal rows, checksum failures, missing previews, and artifacts with missing backing files.
- **FR-050:** Deletion must be owner-authorized and define whether it deletes primary bytes, previews, and row or leaves a tombstone. Source chat deletion behavior must be resolved before implementation reaches production.

## 7. technical decisions and options

### 7.1 Fixed architecture decisions

1. **Sandbox-only binary creation:** The app validates the tool schema and orchestrates storage, but document rendering, conversion, and binary inspection execute inside the existing Eve Docker Sandbox.
2. **Structured specification, trusted generator:** The model supplies declarative JSON. Repository-owned generator code converts that specification to files. The model does not supply executable generation code for this tool.
3. **One database-backed artifact entity:** Generated binary files are dedicated records separate from uploaded/searchable documents and from event-only text artifacts.
4. **Owner-authorized downloads:** Generated artifacts do not rely on unguessable `/api/files/*` URLs as authorization.
5. **Native OOXML:** DOCX/PPTX/XLSX use native package objects; full-page image output is a rejection, not an acceptable implementation shortcut.
6. **Macro-free output:** Only `.docx`, `.pptx`, and `.xlsx`; reject active content and external relationships.
7. **Preview is derivative:** The native file/checksum is authoritative. Preview conversion failure can produce `ready_with_warnings` only if primary validation passes.
8. **No runtime dependency installation:** Required libraries, fonts, validators, and converters are pinned in the Sandbox image at build time.
9. **No arbitrary egress:** Remote images/assets must first exist as explicitly authorized uploaded/source artifacts or be omitted. Generation never follows URLs from the model specification.
10. **Schema migration is explicit:** Use a committed Drizzle migration; normal startup must not mutate schema.

### 7.2 Proposed libraries (decide during the spike)

The current Sandbox image already carries Python and data libraries. The smallest practical initial set is therefore Python-based:

| Format/capability | Preferred candidate | Alternatives | Decision criteria |
|---|---|---|---|
| PDF generation | ReportLab | WeasyPrint from sanitized HTML/CSS; direct PDF via LibreOffice from DOCX | Text selection, tables/charts, links, pagination control, dependency/security footprint, font embedding, licensing |
| DOCX | `python-docx` | TypeScript `docx` | Native styles/tables/sections, headers/footers, relationships, metadata, alt-text support, maintenance |
| PPTX | `python-pptx` | PptxGenJS | Native charts/tables, notes/alt-text support, layout control, text fitting, package validity |
| XLSX | XlsxWriter for creation | `openpyxl` for creation/inspection; ExcelJS | Formula/table/chart coverage, formatting, constant-memory mode, validation/inspection, cached-value limitations |
| Office preview conversion | headless LibreOffice | format-specific renderers | Cross-format fidelity, startup cost, image size, Sandbox resource use, deterministic headless behavior |
| PDF inspection/render | existing `unpdf` in app for text plus Sandbox `pypdf`/`qpdf`/Poppler tools | PDFium/MuPDF | active-content detection, page render, metadata/text extraction, license/image footprint |
| OOXML validation | ZIP/XML structural validator plus format-specific library reload; LibreOffice open/convert | Open XML SDK in a dedicated .NET validator | repair detection, macro/external relationship detection, schema depth, runtime size |

A time-limited technical spike must create representative fixtures with at least two candidate stacks where the table shows a meaningful alternative. The spike report locks the libraries before production implementation. If no candidate can meet native chart/accessibility requirements, the PRD must be amended and re-approved rather than silently weakening acceptance.

### 7.3 Proposed artifact data model

Exact names may follow repository conventions, but the migration must provide equivalent fields:

- `id` UUID primary key
- `userId` required FK, indexed with creation date
- `chatId` required FK for this feature (recommended `onDelete: cascade` only after deletion semantics are approved)
- `messageId` or durable originating assistant turn identity
- `toolCallId` required and unique within a chat/attempt
- `parentArtifactId` nullable for retry/version lineage
- `kind` (`document` for this PRD; extensible)
- `format` (`pdf|docx|pptx|xlsx`)
- `filename`, `mimeType`, `size`, `sha256`
- opaque storage key/blob URL not returned directly to unauthorized clients
- `status`, `errorCode`, `warningCount`
- `templateId`, `templateVersion`, `generatorVersion`, `specVersion`
- `summary` JSONB (bounded, UI-safe fields)
- `validation` JSONB (bounded machine report, no document body)
- `preview` JSONB (authorized asset IDs/metadata)
- `metadata` JSONB (sanitized standard properties)
- `createdAt`, `updatedAt`, `readyAt`

Do not store full generated bytes or base64 in Postgres or Eve events. Decide whether the normalized generation specification needs durable retention for retry/reproducibility; if retained, encrypt or minimize it because it contains user content.

## 8. security and privacy requirements

1. Treat model-produced specifications, user content, uploaded assets, templates, generated ZIP packages, PDFs, and LibreOffice output as untrusted.
2. Validate twice: strict schema/limits before Sandbox execution; signature/package/content validation after generation.
3. Use sanitized leaf filenames in the Sandbox and storage. Never interpolate model/user strings into shell commands; pass a fixed command and JSON file path.
4. Use a unique working directory and a fixed allowlist of readable/writable filenames. Reject symlinks, hard links, device files, sockets, extra outputs, and path traversal.
5. Limit specification size, array lengths, text lengths, table dimensions, chart points, output count/size, archive member count, uncompressed bytes, compression ratio, process time, CPU/memory/PIDs, and preview dimensions.
6. Reject PDF JavaScript, launch actions, embedded files, encryption, and unexpected external actions.
7. Reject OOXML macros, OLE/ActiveX, embedded packages, remote relationships, external templates, external workbook links, DDE, data connections, and suspicious custom XML where validation policy forbids it.
8. Do not fetch hyperlinks or relationship targets. Hyperlinks may be emitted as inert document links.
9. Run LibreOffice and validation tools in the same constrained Sandbox with no host mounts and no direct network route.
10. Use a fresh LibreOffice profile per call and disable macros, update links, recovery prompts, and interactive dialogs.
11. Do not expose raw Sandbox paths/container IDs to users. Logs contain correlation IDs and categorized failures only.
12. Authenticate every artifact/preview API and check owner before reading blob metadata or bytes.
13. Use private/no-store or carefully bounded private caching; never shared-public caching.
14. Sanitize preview HTML/JSON and render PDF/thumbnails without scripts. Apply restrictive CSP and `nosniff`.
15. Checksums prove integrity, not authenticity. Do not claim documents are signed.
16. Backups contain user documents and must follow the same privacy controls as chat/database backups.
17. Add dependency/SBOM and license review for generator/converter/font packages; pin versions and monitor vulnerabilities.
18. Preserve current Sandbox control-plane invariants: no Docker socket in the app, exact sandbox label/network, default-deny middleware, no host ports or mounts.

## 9. validation pipeline

For every tool call:

1. Authenticate principal and require a persisted owned chat.
2. Parse and normalize the versioned generation specification.
3. Enforce format/template/schema/size/complexity limits.
4. Insert an artifact attempt in `generating` state with originating turn/tool identity.
5. Open/reuse the current turn's isolated Sandbox and create a unique call directory.
6. Stage repository-owned generator bundle/template assets and explicitly authorized input assets.
7. Write normalized JSON with `writeTextFile`; execute a fixed generator command.
8. Require exactly one expected primary file plus bounded report/preview candidates.
9. Read file signature and size; transition to `validating`.
10. Run common malicious-package checks and the format-specific validators.
11. Reopen/round-trip with the format library and convert/render with an independent application where required.
12. Compare requested structures with extracted structures (counts, headings, tables, charts, citations, metadata, formulas).
13. Generate a bounded machine validation report and structured summary.
14. Transition to `previewing`; create PDF/thumbnails/worksheet preview assets.
15. Read primary and preview bytes from the Sandbox, calculate SHA-256, and upload under owner-scoped random keys.
16. Atomically finalize row as `ready` or `ready_with_warnings`; on failure store categorized diagnostics, remove unpublished bytes, and return a user-readable failure.
17. Render the result card from opaque artifact ID and persisted metadata.
18. Clean the per-call Sandbox directory; preserve only normal Eve Sandbox session lifecycle required for reconnect semantics.

## 10. test matrix

### 10.1 Common automated tests

Run every format fixture through:

- minimal document;
- multi-section/multi-page or multi-slide/sheet document;
- Unicode (Latin accents, CJK, Arabic/RTL where library support is claimed, emoji fallback);
- long unbroken text and overlong titles;
- table near configured dimension limit;
- chart with missing/null/negative/large values;
- citations with long titles and URLs;
- metadata with quotes, CR/LF, XML metacharacters, control characters, and over-limit values;
- malicious filename/path traversal;
- malformed tool specification;
- forced generator crash/timeout;
- output too large;
- preview conversion failure;
- missing durable blob after ready state;
- second-user authorization attempts;
- reload/rehydration, retry/versioning, chat deletion behavior, backup/restore.

### 10.2 Format-specific tests

| Format | Structural tests | Independent-open/render tests | Native editability tests | Security tests | Visual/content assertions |
|---|---|---|---|---|---|
| PDF | header/trailer, page tree/count, metadata, text extraction, links, fonts | parse with two engines; render every page to image; compare no fatal errors | N/A; verify selectable text and vector/native table/chart where expected | no encryption, JS, launch action, attachment, unexpected URI/action | no blank/clipped pages in golden fixtures; headings/tables/charts/citations present |
| DOCX | ZIP/OOXML required parts, relationships, styles, headings, tables, drawings, headers/footers, core props | reload with writer library; LibreOffice headless convert to PDF; second OOXML validator/editor | edit paragraph/table cell, save, reopen; verify structures persist | no macros/OLE/ActiveX/remote relationships/external template/DDE; ZIP bomb/path checks | converted page count expected; no repair warning; no all-page-image flattening |
| PPTX | package parts, slide/layout/theme relationships, shape/table/chart counts, notes/core props | reload with library; LibreOffice Impress convert to PDF/images; second validator/editor | edit title, move shape, edit table/chart data, save/reopen | no macros/OLE/ActiveX/remote relationships/embedded packages; ZIP checks | all shapes within slide bounds; no material collisions/overflow; thumbnails nonblank |
| XLSX | package parts, sheets/dimensions/types, formulas, tables, charts, names, styles/core props | reload with library; LibreOffice Calc open/recalculate/export; second validator/editor | edit input/table/formula, save/reopen | no macros/OLE/ActiveX/external links/connections/query tables/DDE; formula-injection policy for user-originated text; ZIP checks | expected values/types/formulas; no formula errors in recalculated fixtures; previews bounded/readable |

### 10.3 Required test layers

- **Unit:** schema normalization, filename/MIME mapping, limits, state transitions, citation linking, summaries, MIME headers, safe content disposition, OOXML/PDF security scanners, artifact merge/order logic.
- **Integration:** database migration/constraints; artifact API ownership; blob finalization/orphan cleanup; Sandbox generator invocation; primary validation; preview conversion; missing-file handling.
- **Component/UI:** generation phases, ready/warning/failed/missing cards, detail panel, accessible labels, download action, long filenames, mobile layout.
- **Browser/end-to-end:** signed-in chat request -> timeline progress -> ready artifact -> preview -> authorized download -> reload; repeat for all four formats. Include two users and direct URL attempts.
- **Sandbox/security:** exact network/label/isolation, denied unrelated egress, no runtime package install, binary upload/read-back, time/size limits, no lingering process, cleanup.
- **Migration/rollback:** apply committed migration on representative existing DB; old app compatibility decision; restore pre-migration DB and uploads backup when rollback is not backward compatible.
- **Production acceptance:** one small real document per format, download and independent open, reload, user authorization probe, data/upload baseline preservation, service health/restarts/logs, immutable image ID verification.

### 10.4 Repository verification commands

Implementation must run focused tests first, then at minimum:

```bash
cd /opt/data/miniscira-src
/opt/data/bin/bun run typecheck
/opt/data/bin/bun run lint
/opt/data/bin/bun test
/opt/data/bin/bun run check
git diff --check
```

Sandbox/image changes also require:

```bash
MINISCIRA_VALIDATION_IMAGE=miniscira:<candidate-tag> \
  /opt/data/scripts/validate-miniscira-docker-sandbox.py
```

The validator must be extended to exercise at least one generated binary file and exact write/generate/read/upload/download validation while preserving the existing `RESULT: ALL PASS`, deny probes, egress denial, isolation, logs, and cleanup gates.

## 11. Model and tool eval plan

Model evals apply because this feature adds an agent tool, routing behavior, structured arguments, tool-result interpretation, and limitation reporting.

Create `evals/generate-document.eval.ts` plus deterministic fixtures. Run against the default model and a representative fast/cheap model from the live gateway catalog. Do not hard-code a provider-only model assumption.

### Eval cases

1. Explicit PDF report request with cited research and a table.
2. DOCX business letter with metadata and no chart.
3. PPTX request with exact slide count, table, and chart.
4. XLSX request from a small data table with formulas and chart.
5. Ambiguous “make me a report” request: choose a documented default format or ask a targeted question according to the locked UX decision.
6. Request for editable PDF: explain PDF fixed layout limitation and offer DOCX plus optional PDF; do not claim PDF is natively editable.
7. Request for macro-enabled workbook: refuse active content and offer `.xlsx`.
8. Request for an unsupported chart/layout feature: generate a documented safe fallback or clearly state limitation.
9. Request containing a remote image URL: do not fetch it through generation; request upload or omit with warning.
10. Multiple deliverables: produce one tool call per file with correct independent formats.
11. Tool returns validation failure: do not claim completion or provide a ready download.
12. Tool returns ready-with-warnings: summarize specific warnings without exaggerating success.
13. Prompt-injection text inside source content: treat it as content, not tool instructions.
14. Large/over-limit request: reduce scope with user disclosure or ask before generation; do not evade tool limits.
15. Existing uploaded data used for XLSX: pass only explicitly user-owned filename inputs and create correct typed structures.

### Eval checks and pass thresholds

- **100%** of explicit supported-format requests call `generate_document` with the requested format.
- **100%** of macro/active-content requests avoid unsupported macro-enabled output.
- **100%** of validation-failure results are not described as successful or downloadable.
- **100%** of ready results mention the artifact without repeating binary/base64 content.
- **>=95%** schema-valid tool arguments on the first call across supported cases.
- **>=90%** required requested structures represented in the normalized specification across the fixture set; no critical item (format, title, primary table/chart, citation request) may be omitted.
- **100%** citation-bearing fixtures pass marker/reference consistency after generation.
- **100%** multi-file requests use separate calls and preserve requested formats.
- **0** remote URL fetch attempts by the generator.
- Run each non-deterministic eval at least three times per selected model; all safety assertions must pass every run. Quality thresholds use aggregate results and record model ID/catalog timestamp.

The eval harness must inspect tool calls and, for selected cases, execute against a deterministic fake generator result. A separate integration suite executes real Sandbox generation so model variance is not conflated with rendering correctness.

## 12. success metrics

- >=95% successful generation/validation rate for supported requests within configured limits in acceptance fixtures.
- 100% of accepted DOCX/PPTX/XLSX fixtures open without repair warnings in required validators/editors.
- 100% owner-authorization test pass rate; zero cross-user byte or metadata access.
- 100% corrupt/active-content/mismatched-format fixtures blocked before ready state.
- Median generation-to-ready under 20 seconds and p95 under 60 seconds for small standard fixtures on the documented reference host; final targets must be measured and approved during the spike.
- Artifact survives chat reload and app recreation in 100% of durability tests.
- Preview success >=95% for standard fixtures, with explicit warning fallback for the remainder.
- No Sandbox network-policy regression, lingering generation processes, or orphaned ready rows in acceptance runs.

## 13. deployment, migration, observability, and rollback

### Deployment

1. Complete the library/font/converter spike and record pinned versions, licenses, image-size impact, CVE scan, and fixture evidence.
2. Add a committed DB migration and back up Postgres plus uploads before applying it.
3. Build a unique candidate image; do not overwrite the known-good production tag before scratch acceptance.
4. Run repository checks, focused format tests, model evals, and the extended Sandbox validator.
5. Exercise the four real browser flows in scratch.
6. Back up exact production Compose, preserved Stack environment, immutable image IDs, database, uploads, and baseline counts.
7. Deploy the candidate, verify migrations, health, image IDs, services, logs, isolation, and one real file per format.
8. Verify repository changes are committed and pushed according to the MiniScira production source-control invariant.

### Observability

- Structured phase events: request accepted, sandbox opened, generated, primary validated, preview converted, stored, finalized, failed/cleaned.
- Counters by format/template/status/error category.
- Histograms for generation/validation/preview/upload durations and byte/page/slide/sheet counts.
- Gauge/query for stuck attempts older than threshold and orphan/missing storage detections.
- Never log body text, table data, citations, raw metadata, signed/opaque download tokens, secrets, or complete filenames when they may be sensitive; use artifact ID and sanitized/hashed correlation where necessary.

### Rollback

- If no incompatible migration has run, restore the prior app image/Compose while preserving DB/uploads.
- If the old app cannot tolerate the new table/enum/state, document compatibility and restore the pre-migration DB backup before starting the old image.
- New generated files created after migration must not be blanket-deleted during rollback. Preserve them and provide a recovery/export path, or explicitly document that the rolled-back UI cannot display them until forward recovery.
- Keep previous image IDs and backups through the rollback window.
- Verify health, baseline data, existing uploads, chat, and Sandbox behavior after rollback; health alone is insufficient.

## 14. ordered implementation tasks (derive TODOs only after approval)

### Phase 0 — decisions and fixtures

- [ ] **T-001:** Build a time-limited generator/validator spike for each format using the candidate libraries in §7.2. Record fidelity, editability, security detection, conversion, performance, image size, license, and accessibility limitations.
- [ ] **T-002:** Lock library versions, font set, converter, validators, default limits, ambiguous-format UX, artifact deletion/chat-deletion semantics, and specification retention policy. Amend/reapprove this PRD if acceptance is weakened.
- [ ] **T-003:** Commit deterministic source specifications and expected structural assertions/golden render fixtures for PDF, DOCX, PPTX, and XLSX.

### Phase 1 — contracts and persistence

- [ ] **T-004:** Define shared versioned Zod schemas for generation specification, format options, citations, chart data, summaries, validation reports, tool result, and state transitions.
- [ ] **T-005:** Add generated-artifact schema, indexes/constraints, relations, inferred types, and committed Drizzle migration.
- [ ] **T-006:** Add owner-scoped artifact repository/service functions implementing state transitions, retry/version lineage, finalization, orphan cleanup, and missing-file detection.
- [ ] **T-007:** Add owner-scoped generated storage key helpers, MIME/extension detection, SHA-256 recording, and safe filename/content-disposition handling.
- [ ] **T-008:** Add authenticated metadata/list/download/preview/delete-or-retry APIs with cross-user tests.

### Phase 2 — Sandbox generator and validation

- [ ] **T-009:** Package pinned generator libraries, validators, LibreOffice/Poppler or chosen alternatives, and fonts into the Sandbox image; update bootstrap readiness checks and deployment documentation.
- [ ] **T-010:** Implement repository-owned template registry/assets with IDs, versions, applicability metadata, theme/layout tokens, and template security tests.
- [ ] **T-011:** Implement the fixed Sandbox generator CLI/entrypoint that consumes normalized JSON and emits exactly one primary file plus bounded report assets.
- [ ] **T-012:** Implement PDF generator and exact structural/security/content validation.
- [ ] **T-013:** Implement DOCX generator and exact OOXML/native-editability/security validation.
- [ ] **T-014:** Implement PPTX generator and exact OOXML/layout/native-editability/security validation.
- [ ] **T-015:** Implement XLSX generator and exact OOXML/formula/table/chart/security validation.
- [ ] **T-016:** Implement common archive bomb/path/symlink/extra-output/time/size/process guards and categorized validation reports.
- [ ] **T-017:** Implement independent LibreOffice/renderer round-trip checks and format-specific preview generation.

### Phase 3 — agent orchestration

- [ ] **T-018:** Add `generate_document` tool schema/description and authenticated orchestration: persist attempt, stage authorized assets, execute fixed command, validate, preview, upload, finalize, clean up.
- [ ] **T-019:** Add agent instructions for format selection, one-file-per-call, native editability, citation structures, active-content rejection, limitation disclosure, and preview/failure handling.
- [ ] **T-020:** Ensure tool events/results persist opaque artifact identity and bounded metadata only; no raw bytes/base64 or duplicated document body.
- [ ] **T-021:** Add tool/integration tests for state transitions, forced failures, retry/versioning, cancellation/disconnect, Sandbox reuse, and orphan cleanup.

### Phase 4 — chat UI

- [ ] **T-022:** Add timeline classification/node for document generation phases, completion, warning, failure, and interruption.
- [ ] **T-023:** Add database-backed artifact loading/merge by originating turn/tool call and prevent duplicate event/database cards.
- [ ] **T-024:** Add completed document card with format icon, filename, counts, size, template, validation state, warnings, preview/summary, and owner-authorized download.
- [ ] **T-025:** Extend the artifact detail panel (or add a document detail panel) for PDF/thumbnails, XLSX safe preview, metadata, citations/structure summary, missing-preview state, and mobile behavior.
- [ ] **T-026:** Add accessible loading/error/warning/missing states, keyboard behavior, screen-reader labels, and reduced-motion-compliant transitions.
- [ ] **T-027:** Add component and browser tests for all four formats, reload, long content, narrow screens, preview failure, missing blob, and two-user authorization.

### Phase 5 — evals, operations, and release

- [ ] **T-028:** Add and run model/tool eval dataset in §11 across selected live gateway models and record thresholds/results.
- [ ] **T-029:** Extend `/opt/data/scripts/validate-miniscira-docker-sandbox.py` to prove binary generation/read-back/upload/download/checksum and preserve all existing security/isolation/cleanup assertions.
- [ ] **T-030:** Add artifact metrics/log categories, stuck-attempt/orphan/missing-file detection, and an operator repair/cleanup procedure that never blanket-deletes user data.
- [ ] **T-031:** Update deployment, backup/restore, storage growth, dependencies/fonts, migration, rollback, and production acceptance documentation.
- [ ] **T-032:** Run full repository, format, security, browser, eval, scratch Sandbox, migration/rollback, backup/restore, and production acceptance matrices.
- [ ] **T-033:** Verify intended changes are committed/pushed, production runs the accepted immutable image, and working tree/source-control invariants hold.

## 15. traceability matrix

| Requirement/story | Primary tasks | Verification evidence |
|---|---|---|
| US-001, FR-010 | T-003, T-012, T-017, T-018, T-024, T-027 | PDF unit/integration/render/browser fixtures and production PDF |
| US-002, FR-011 | T-003, T-013, T-017, T-018, T-024, T-027 | DOCX package/security/open/edit/reopen/browser tests |
| US-003, FR-012 | T-003, T-014, T-017, T-018, T-024, T-027 | PPTX package/layout/security/open/edit/reopen/browser tests |
| US-004, FR-013 | T-003, T-015, T-017, T-018, T-024, T-027 | XLSX type/formula/table/chart/security/open/edit/reopen/browser tests |
| US-005, FR-017–021 | T-001, T-002, T-010, T-012–017 | Template registry tests, render goldens, font/overflow reports |
| US-006, FR-022–025 | T-004, T-011–015, T-019, T-028 | Structural fixture assertions and citation evals |
| US-007, FR-035–041 | T-017, T-022, T-024–027 | Preview conversion tests and UI/browser states |
| US-008, FR-026–034 | T-005–008, T-020, T-023, T-031–032 | Migration/API/durability/reload/backup-restore tests |
| US-009, validation pipeline | T-009, T-011, T-016–018, T-021, T-029, T-032 | Extended Sandbox validator `RESULT: ALL PASS` and logs/process inspection |
| US-010, security §8 | T-006–009, T-016, T-018, T-027, T-032 | Two-user API/browser matrix, malicious fixtures, isolation checks |
| FR-042–045 | T-002, T-010, T-012–015, T-025–027 | Structural accessibility tests and manual UI checks |
| FR-046–050 | T-006, T-018, T-021, T-030–032 | Failure/retry/orphan/stuck/deletion/rollback tests and metrics |
| Model behavior §11 | T-019, T-028 | Eval report meeting every stated threshold |
| Release/rollback §13 | T-029–033 | Scratch/production acceptance, backups, rollback drill, Git verification |

## 16. Open questions that need approval or spike evidence

1. When a request says only “make a report,” should MiniScira default to DOCX (editable) or ask the user to choose DOCX/PDF? Proposed default: DOCX when editability is implied; PDF when final/shareable fixed layout is implied; ask only when neither is inferable.
2. Should generation support producing both native OOXML and a PDF companion in one user request? Proposed behavior: two independent tool calls/artifact records, never one hidden secondary output.
3. Which proposed library stack passes the native-chart, accessibility, validation, and image-size spike without unacceptable limitations?
4. Is headless LibreOffice acceptable in the production/Sandbox image given its size and patching burden, or should it live in a separate pinned Sandbox image? The current Eve configuration uses the app image as Sandbox image, so separation would require explicit architecture work.
5. What are final resource limits after measurement on the Umbrel reference host?
6. Should ready artifact deletion leave a tombstone in the chat or remove the card? Proposed: tombstone with provenance and explicit deleted state.
7. What happens when a chat is permanently deleted? Proposed: cascade artifact metadata and bytes only after a recoverable/confirmed chat-deletion workflow exists; archiving must never delete artifacts.
8. Should the normalized generation specification be retained for exact retry? Proposed: retain a minimized, versioned spec only if encryption/privacy review approves; otherwise retries create a new spec from conversation context.
9. Which independent OOXML validator/editor is available in CI in addition to LibreOffice? Options include a schema-level validator or a .NET Open XML SDK validation utility in a dedicated test image.
10. How much RTL and complex-script support can the chosen libraries/templates honestly claim? Unsupported script/layout behavior must be documented and surfaced.
11. Should XLSX cells beginning with `=`, `+`, `-`, or `@` from user/source text default to literal strings unless explicitly typed as formulas? Proposed: yes; formulas require an explicit formula node in the specification.
12. Should generated artifacts be indexed as searchable documents automatically? Proposed: no in this PRD; avoid circular ingestion and duplicate storage until separately specified.

## 17. approval gate

Implementation must not begin until the user explicitly approves this PRD and the decisions in §16 that materially affect architecture, UX, limits, deletion, or security are locked. After approval, derive the ordered tasks above into the agent TODO list and map each acceptance criterion to exact test/eval commands before changing product code.

## 18. Implementation handoff

- **Source of truth:** `/opt/data/miniscira-src/tasks/prd-document-generation.md`, plus `AGENTS.md`, `docs/PRODUCT_PLANNING.md`, `docs/ENGINEERING_INVARIANTS.md`, `docs/DEVELOPMENT_PRINCIPLES.md`, `docs/DEPLOYMENT.md`, and `docs/UMBREL_SANDBOX_OPERATIONS.md`.
- **Repository context:** `/opt/data/miniscira-src`; durable app data remains in Postgres and `/data/uploads`; Sandbox operations must retain the existing middleware/network/egress invariants.
- **Branch/worktree:** start from a clean, explicitly named implementation branch/worktree after approval. Do not modify production directly.
- **Likely affected areas:** `agent/tools/`, `agent/instructions/`, `agent/sandbox.ts`, generator/template assets, `lib/db/schema.ts`, `lib/db/migrations/`, `lib/local-blob.ts` or a generated-artifact storage module, `app/api/artifacts/`, `components/timeline/`, `components/chat/assistant-turn.tsx`, `components/ai-elements/`, `components/research-chat.tsx`, `evals/`, `Dockerfile`, deployment docs, and Sandbox validator scripts.
- **Locked constraints:** structured spec, trusted Sandbox generator, owner-authorized artifact APIs, native macro-free OOXML, derivative previews, no runtime dependency install, no arbitrary egress, explicit migration, no scope expansion into Artifact Library or editing.
- **Acceptance:** follow tasks T-001 through T-033 in dependency order; stop and ask if a §16 decision remains unresolved; do not substitute a simpler flattened format; run every required test/eval/acceptance gate; report file-level changes and real execution evidence.
- **Implementation prompt:** “Implement only the explicitly approved PRD at `tasks/prd-document-generation.md`. Follow `AGENTS.md` and every linked applicable document. Resolve Phase 0 decisions before product code. Do not expand scope, weaken native-format/security acceptance, or improvise unresolved UX/architecture decisions. Keep one atomic TODO in progress, run mapped focused checks after each task and full verification before completion, exercise the real browser and Sandbox flows for all four formats, and report exact files changed plus test/eval/deployment evidence. Stop if ambiguity remains.”

> **Review request:** Please review and explicitly approve or request changes. Draft status alone does not allow implementation.
