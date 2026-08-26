# PRD: natural-language image editing

- **Status:** To do
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-image-editing)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Not approved
- **Repository:** `/opt/data/miniscira-src`
- **Drafted:** 2026-08-23
- **Scope:** Full backlog scope. This document does not authorize implementation.

## 1. Overview

MiniScira already lets a signed-in user upload images as vision attachments and generate new images with `generate_image`. It does not let the user ask for a durable edit of an existing image. The current generation tool explicitly excludes editing, generated files have no database artifact record or version lineage, image routing assumes one `IMAGE_MODEL`, and the timeline only understands generation progress/success/failure.

This feature adds conversational image editing across chats containing multiple images. A user can click any eligible image to make it the current editing target, see that target clearly in the editing workspace and composer, describe the change in natural language, and switch targets without losing conversational context. Each submitted edit still has exactly one explicit source image. MiniScira automatically invokes an editing-capable image backend. The original remains unchanged. Every successful result is stored as a new durable, authorized artifact with lineage back to its source image and originating chat turn. Progress, success, and failure states with clear next steps appear directly in the conversation.

The ordinary UI must not expose provider, endpoint, or backend selection. Operators configure eligible image models and capability metadata; MiniScira routes automatically and fails clearly when no configured route can edit.

## 2. Evidence and current constraints

### 2.1 Repository constraints inspected

- Uploaded images are accepted by `app/api/documents/route.ts`, stored through `lib/local-blob.ts`, and represented by the `document` table in `lib/db/schema.ts`.
- Image uploads become `kind: "image"`, `status: "ready"`, and are sent to Eve as model-facing `file` parts encoded as data URLs by `components/research-chat.tsx` because the AI SDK rejects private-host downloads.
- `hooks/use-chat-attachments.ts` owns optimistic attachment state and browser object URL cleanup.
- Generated images use `agent/tools/generate_image.ts`, AI SDK `generateImage()`, `lib/gateway.ts`, and `IMAGE_MODEL`; output bytes are written locally but are not represented by a durable database artifact row.
- `components/timeline/parts.ts` maps only `generate_image` to the image node. `components/timeline/nodes/research.tsx` renders its progress, result, or error.
- The deployment has one durable upload volume (`LOCAL_STORAGE_DIR`, normally `/data/uploads`) plus Postgres. Complete backup/restore requires both.
- The live `/v1/models` catalog is authoritative for availability, but today it does not advertise image-edit capability. `AI_MODELS_JSON` is metadata-only and currently supports only chat-facing `vision` and `fileInput` hints.
- Gateway credentials may be per-user or shared. The current image generation helper reads only the deployment key, which must not be copied into the new design.
- The `/api/files/*` route currently relies on unguessable names rather than database-backed authorization. The feature's strict artifact authorization requirement cannot rely on URL entropy alone.
- Eve events are opaque; only `eventType()` in `lib/chat-events.ts` may inspect `.type`. Durable stream/reconnect behavior must remain intact.
- Normal startup must not mutate schema. Any new tables/columns require committed Drizzle migrations and the one-shot migration service.
- The existing AI SDK version accepts `generateImage({ prompt: { images, text, mask } })`; the installed OpenAI provider sends this form to `/images/edits` as multipart fields `model`, `prompt`, one or more `image`, and optional `mask`.

### 2.2 Live gateway probe (non-billable validation)

At 2026-08-23T04:48:40Z, the configured gateway at `http://10.21.0.1:8317/v1`:

- returned a live catalog containing `gpt-image-1.5`, `gpt-image-2`, `grok-imagine-image`, and `grok-imagine-image-quality`;
- accepted authenticated `POST /images/edits` routing and returned structured validation errors;
- returned `400 invalid_request_error: prompt is required` when only `model` was supplied;
- returned `400 invalid_request_error: image is required` when `model` and `prompt` were supplied.

This verifies that the live gateway exposes the OpenAI-compatible edit endpoint and expected required field names without submitting a real image or incurring an edit. It does **not** prove that every catalog image model supports editing, the accepted image formats/sizes, multi-image behavior, mask semantics, fidelity, latency, or output quality. Those remain implementation spike and deployment acceptance gates.

### 2.3 Product reference screenshots

The user supplied four ChatGPT image-editing screenshots as interaction references, not visual specifications to copy. They demonstrate useful principles:

- an image-local **Edit** action makes the entry point discoverable;
- a focused image workspace gives the current source image visual priority;
- the editing composer remains visibly bound to the current image;
- image-specific actions can live near the canvas while conversation-level actions remain separate;
- aspect-ratio and localized-selection controls use progressive disclosure rather than crowding the normal chat;
- the active editing target must be obvious through more than canvas prominence when a chat contains multiple images.

MiniScira must adapt these principles to its existing component vocabulary, spacing, typography, colors, motion tokens, timeline, and responsive behavior. It must not copy ChatGPT's layout, labels, control grouping, or styling.

## 3. Problem statement

Users can discuss an uploaded image, but asking "remove the person in the background" cannot produce a revised file. They must leave MiniScira, lose conversational context, manually use another editor, and re-upload the result. This breaks the product's durable, visible-work workflow and makes iterative visual work cumbersome.

A correct solution must address more than an image API call:

1. identify exactly which user-owned image is being edited;
2. route to a backend proven to support edits, without ordinary-user configuration;
3. preserve the original and every result with immutable lineage;
4. keep private image bytes and credentials within authorized boundaries;
5. render durable progress and results through reconnects/reloads;
6. distinguish unsupported capability, invalid input, moderation, timeout, provider, and storage failures;
7. objectively evaluate both agent routing and edit fidelity.

## 4. Goals

- Let a signed-in user request common natural-language edits to an attached or previously produced image.
- Let a user converse with multiple images in one chat, select any eligible image as the current editing target, and switch targets deliberately.
- Make the selected source unmistakable in the image surface and composer before submission.
- Automatically select an editing-capable configured model without exposing provider controls in the normal composer.
- Preserve the source file byte-for-byte and store every successful edit as a new immutable version.
- Persist user, chat, turn, source, prompt, model route, dimensions, MIME type, size, status, and timestamps needed for provenance and operations.
- Show durable editing progress, completed output, lineage, download/open actions, and actionable errors in the conversation.
- Enforce database-backed per-user authorization for source lookup and result delivery.
- Support iterative edits where any prior successful version can become the source of a new branch.
- Degrade clearly when generation is available but editing is not.
- Provide unit, integration, migration, security, browser/E2E, live gateway acceptance, and model-eval gates.

## 5. Success metrics and service targets

These are release gates or post-release measurements, not promises about an external provider.

- **Task success:** at least 90% of supported golden-path E2E cases produce a persisted result or a correctly classified actionable failure; no silent failures.
- **Routing precision:** 100% of explicit edit requests in the routing eval invoke `edit_image`; 0% of generation-only, analysis-only, chart, or unsupported non-image cases invoke it.
- **Source safety:** 100% of successful edits preserve the source blob checksum and create a different artifact ID/storage key.
- **Authorization:** 100% of cross-user source, metadata, and byte-delivery probes return 404/403 without leaking existence or metadata.
- **Durability:** 100% of successful test edits remain visible and downloadable after page reload and Eve reconnect.
- **Failure clarity:** 100% of listed failure fixtures map to a stable error class shown to users and recovery guidance.
- **Latency instrumentation:** record queue/start/provider/storage/total durations. Initial soft target: p50 under 45 seconds and p95 under 120 seconds on the validated production backend; exceeding the target is visible in telemetry but does not convert a valid result into failure.
- **Quality:** the edit-quality evaluation suite meets the thresholds in section 16 before a backend/model is marked production-capable.

## 6. Personas and user stories

### US-001: edit a newly attached image

**Description:** As a user, I want to attach an image and describe a change in the same message so that MiniScira returns the revised image.

**Acceptance criteria:**

- [ ] A ready image attachment plus an explicit edit instruction is routed to image editing, not image generation or prose-only analysis.
- [ ] The source image is identified by durable ID, not filename alone.
- [ ] Progress appears in the timeline before the provider finishes.
- [ ] The successful result appears inline with open and download actions.
- [ ] Reloading the chat preserves the source attachment, progress terminal state, and output.
- [ ] Browser verification covers desktop, narrow screen, keyboard access, and reduced motion.

### US-002: edit an earlier image in the current chat

**Description:** As a user, I want to say "make the last image warmer" so that I can iterate without re-uploading it.

**Acceptance criteria:**

- [ ] "Last image" resolves deterministically to the most recent user-owned image artifact visible before the current turn.
- [ ] A precise reference such as a selected image/version resolves to that ID.
- [ ] If two or more plausible images remain and recency does not resolve the wording, the agent asks one focused clarification and does not call the edit backend.
- [ ] Images from other users or inaccessible chats never enter the candidate set.

### US-003: preserve versions and branches

**Description:** As a user, I want every edit to preserve previous versions so that I can compare, download, or branch from any result.

**Acceptance criteria:**

- [ ] The original blob is never overwritten or mutated.
- [ ] Each result has a unique artifact/version ID, storage key, checksum, and direct parent ID.
- [ ] Editing version 2 twice creates two children of version 2 rather than rewriting a linear counter.
- [ ] The UI labels the source/result relationship and can open the immediate parent.
- [ ] Deleting a child does not delete its parent; parent deletion behavior follows section 12.

### US-004: automatic backend routing

**Description:** As a user, I want MiniScira to choose a capable backend automatically so that I do not need provider knowledge.

**Acceptance criteria:**

- [ ] The ordinary UI contains no provider/model dropdown for image editing.
- [ ] Routing only selects live-catalog models whose operator metadata says `imageEdit: true` and whose capability probe is healthy.
- [ ] Routing order is deterministic and operator-configurable.
- [ ] A failed preferred route may fall through only to another explicitly edit-capable route, never to a generation-only model.
- [ ] The persisted result records selected model ID and attempt summaries for operator diagnosis, while ordinary UI shows provider-neutral messaging.

### US-005: understand unsupported deployments

**Description:** As a user, I want a clear explanation when this deployment cannot edit images so that I know the request was understood and what I can do.

**Acceptance criteria:**

- [ ] If image generation works but no edit-capable route is configured, the timeline says image editing is unavailable on this deployment.
- [ ] The system does not silently generate a lookalike from text.
- [ ] The source image remains unchanged and no result row is marked successful.
- [ ] Operators receive a diagnostic naming the capability/configuration issue without secrets.

### US-006: recover from failures

**Description:** As a user, I want failures to be specific and retryable when safe so that I do not lose my image or instruction.

**Acceptance criteria:**

- [ ] Upload, validation, unsupported capability, moderation, rate limit, timeout, provider, decode, and storage failures have distinct stable codes.
- [ ] Retry reuses the immutable source and original instruction but creates a new attempt ID.
- [ ] Automatic retries are bounded and occur only for transient errors.
- [ ] A storage failure after provider success never displays a temporary provider URL as a durable result.
- [ ] Failed attempts are durable enough for diagnosis but never masquerade as artifact versions.

### US-007: keep images private

**Description:** As a user, I want only authorized users to access my source and edited images.

**Acceptance criteria:**

- [ ] Metadata queries and byte delivery verify ownership on the server.
- [ ] Guessing another user's artifact ID, document ID, or storage path returns no bytes or metadata.
- [ ] Provider requests contain only the selected source/mask bytes and required prompt/options.
- [ ] Logs and events omit base64 image data, credentials, signed URLs, and full private prompts by default.

### US-008: use a mask when explicitly supplied

**Description:** As an advanced user, I want to attach an optional mask so that I can constrain an edit to a region.

**Acceptance criteria:**

- [ ] A source image and mask can be distinguished explicitly in the request.
- [ ] Mask dimensions are validated against the normalized source dimensions.
- [ ] A backend lacking mask support is not selected for a masked request.
- [ ] An invalid mask fails before provider invocation with corrective guidance.

### US-009: select one image from a multi-image conversation

**Description:** As a user, I want to click an image in a conversation and make it the current editing target so that I can move naturally among several images without referring to filenames or guessing which one MiniScira will change.

**Acceptance criteria:**

- [ ] Every eligible uploaded, generated, or edited image exposes the same accessible selection/edit entry point.
- [ ] Clicking an eligible image opens or updates the focused editing workspace and sets that artifact as the sole active source.
- [ ] The active source is shown with a selected state on its thumbnail or image card and as an `Editing` context item attached to the composer.
- [ ] The context item includes a thumbnail, accessible name, provenance or version label, and a remove/clear action.
- [ ] Switching to another image updates both the selected image state and composer context before any edit can be submitted.
- [ ] Only one image can be the active edit source at a time; other images remain available as conversational or visual references but are not silently submitted as edit inputs.
- [ ] Clearing the active source returns the composer to ordinary chat mode without deleting or detaching any image from the conversation.
- [ ] If the selected image becomes deleted, inaccessible, missing, or not ready, submission is blocked with a specific recovery message.
- [ ] Reloading or reconnecting restores a durable editing target only when the draft state was intentionally persisted; otherwise no image is implicitly selected.
- [ ] Keyboard, screen-reader, touch, narrow-screen, reduced-motion, and browser-back/close behavior are verified.

## 7. Scope

### 7.1 In scope for the full backlog

- Multiple eligible images may coexist in one conversation and focused editing workspace.
- One explicitly active source image per submitted edit; ordinary reference images may remain in conversation context but are not sent to the edit endpoint unless a later approved multi-input edit contract requires them.
- Optional single mask image.
- Source selection from ready uploaded images and successful generated/edited image artifacts owned by the caller.
- Common edits: object addition/removal, background replacement, recoloring, canvas extension/outpainting, local changes via mask, and restyling.
- Automatic model selection, capability probing, deterministic fallback, and unsupported behavior.
- Immutable artifact/version lineage, including branches.
- Durable local storage and Postgres metadata.
- Timeline progress, terminal success/failure, result preview, provenance, open/download, and "edit this version" affordance.
- Privacy, authorization, retention/deletion rules, observability, backups, deployment, rollback, and model qualification.
- Existing JPEG, PNG, WebP, GIF, AVIF, HEIC, and BMP uploads may still be accepted for vision, but the edit pipeline must normalize only formats its backend contract safely supports.

### 7.2 Non-goals

- No pixel-level canvas editor, brushes, layers, crop handles, filters panel, or Photoshop-style UI.
- No ordinary-user provider/model/endpoint controls.
- No destructive overwrite, "save in place," or mutation of source bytes.
- No video editing, animation editing, 3D editing, or audio editing.
- No face swap, identity cloning workflow, watermark removal promise, or bypass of provider safety policy.
- No guarantee of exact typography, logos, identity, or fine-detail preservation beyond measured backend capability.
- No cross-chat global Artifact Library UI in this PRD; the data model must be compatible with that future backlog item.
- No collaborative/shared artifact access beyond current owner-private semantics.
- No bulk batch editing in the first implementation.
- No indefinite provider retry loop and no fallback from editing to text-to-image generation.
- No implementation work before explicit PRD approval and a derived execution TODO/test/eval plan.

## 8. Product and UX requirements

### 8.1 Source selection

- **UX-1:** The primary flow is "attach image + instruction + send." No extra mode toggle is required.
- **UX-2:** Every eligible rendered image exposes a consistent accessible "Edit image" action. Clicking the image or invoking that action stages its durable artifact reference and opens or updates the focused editing workspace.
- **UX-3:** Textual references resolve as follows: explicit selected artifact ID first; image attached to the current turn second; unambiguous ordinal/name reference third; "last/this image" to the most recent eligible image before the turn fourth; otherwise ask for clarification.
- **UX-4:** Filename matching is advisory only. Execution always receives and authorizes a durable source ID.
- **UX-5:** A user may analyze an image without editing it. The agent must distinguish analysis from edit requests. An attached image alone must not trigger an edit.

### 8.2 Focused editing workspace

- **UX-6:** The workspace is image-first but remains part of the current chat. It may use an expanded in-chat surface or responsive overlay, but closing it must return to the same conversation and scroll context.
- **UX-7:** The active image occupies the primary canvas. When multiple eligible images exist, provide a compact thumbnail switcher or equivalent current-chat image navigator; do not show an undifferentiated attachment grid.
- **UX-8:** Selection uses the existing accent token for a restrained border/ring and a semantic `Editing` label. Do not rely on color alone: include selected semantics, visible text, and screen-reader announcement.
- **UX-9:** The composer shows one persistent source context item immediately before or above the input. It includes thumbnail, short title or version, origin indicator (`Uploaded`, `Generated`, or `Edited vN`), and clear action.
- **UX-10:** Selecting another image replaces the active source atomically. The previous image must lose its selected state before the new edit can be submitted.
- **UX-11:** The send action is disabled when the edit instruction is blank, source authorization is unresolved, source upload is incomplete, or the source is missing/deleted.
- **UX-12:** Aspect ratio and localized selection/mask controls, if enabled by the approved implementation phase, use contextual popovers or tool modes and apply only to the active source. They must not appear as permanent controls in ordinary chat.
- **UX-13:** Desktop may use a larger canvas with a compact source strip; narrow screens use a full-width canvas and horizontally scrollable thumbnails with a sticky composer. All targets meet touch sizing and safe-area requirements.
- **UX-14:** Workspace transitions use existing motion tokens, last 150–250 ms, communicate state rather than decorate, and become instant or crossfade-only under reduced motion.
- **UX-15:** The UI must preserve familiar MiniScira controls and avoid copying ChatGPT's exact toolbar, pills, icon arrangement, dark canvas treatment, or wording.

### 8.3 Timeline and result presentation

- **UX-16:** Pending state label: "Editing image," with a provider-neutral summary of the instruction and source thumbnail.
- **UX-17:** Long-running state remains connected to the durable Eve tool call and survives reconnects; do not introduce a separate browser-only job state.
- **UX-18:** Success label: "Edited image." Show the output with `object-contain`, descriptive alt text derived from the user instruction, source/version provenance, and open/download actions.
- **UX-19:** Failure label is specific ("Image editing unavailable," "Edit blocked," "Edit timed out," etc.) and includes a short next action.
- **UX-20:** Never show raw provider stack traces, model payloads, keys, or internal paths.
- **UX-21:** The user can retry a failed edit and can start a new edit from any successful version.
- **UX-22:** UI states cover loading, empty/no-source, ambiguity, unsupported, validation, moderation, transient provider error, permanent provider error, post-provider storage failure, missing backing file, and deleted source/result.
- **UX-23:** All controls are keyboard reachable; progress has a live-region announcement that does not repeatedly spam screen readers; animation obeys existing motion tokens and reduced-motion preferences.

## 9. Functional requirements

### Intent and invocation

- **FR-1:** Add a dedicated Eve tool named `edit_image`; do not overload `generate_image` with optional source behavior.
- **FR-2:** The tool input contract must include `sourceArtifactId`, `instruction`, optional `maskArtifactId`, and optional normalized edit intent/options that are backend-neutral.
- **FR-2A:** The browser may display and navigate many eligible images, but each submitted tool call contains exactly one authorized `sourceArtifactId`. UI-only selection state is never inferred by the server from visual position or filename.
- **FR-3:** The tool must reject missing, ambiguous, inaccessible, deleted, non-image, non-ready, oversized, or unsupported-format sources before contacting a provider.
- **FR-4:** Agent instructions must route explicit edits to `edit_image`, generation from scratch to `generate_image`, image questions to vision/prose, and charts/data to `run_code`.
- **FR-5:** The agent must ask a focused source clarification instead of guessing when deterministic resolution fails.

### Authorization and credentials

- **FR-6:** Tool execution must derive the current user from Eve's authenticated principal, not from user-supplied IDs.
- **FR-7:** Source and mask lookup must be scoped by principal user ID and return a non-leaking not-found result for inaccessible records.
- **FR-8:** Image editing must use the same per-user-or-shared credential resolution policy as chat turns. A BYOK deployment with no shared key must not require or leak a deployment key.
- **FR-9:** The byte-serving path for protected artifacts must perform database-backed authorization. URL entropy alone is insufficient.

### Routing and capability

- **FR-10:** Add explicit operator metadata for image routes, separate from chat picker metadata. Minimum fields: model ID, enabled, priority, `generate`, `edit`, `mask`, accepted MIME types, maximum input bytes/pixels, output formats, and optional model-specific options.
- **FR-11:** Live gateway catalog availability remains authoritative. Configuration may decorate or constrain a live model but cannot invent availability.
- **FR-12:** Capability discovery must combine configured claims with a safe probe/cache. A catalog entry alone is not proof of `/images/edits` support.
- **FR-13:** The router must filter on request requirements (edit, mask, MIME, dimensions, bytes), capability health, and credential availability, then sort deterministically by configured priority and model ID.
- **FR-14:** The router may retry/fallback only on transient route failures (timeout, 429, selected 5xx, connection reset) and only to another eligible edit route.
- **FR-15:** Invalid request, moderation/policy, authentication/authorization, and unsupported-input failures must not cascade through every backend unless the error is proven route-specific.
- **FR-16:** If no eligible route exists, return `IMAGE_EDIT_UNSUPPORTED` before uploading private bytes to any generation-only endpoint.
- **FR-17:** The ordinary UI must not expose route choice. Advanced operator diagnostics may expose selected route and capability health.

### Image preparation and provider call

- **FR-18:** Read source bytes from owned durable storage on the server. Do not send the app's private-host URL to the provider.
- **FR-19:** Verify content by magic bytes/decoder, not browser-supplied MIME alone; reject malformed or decompression-bomb images.
- **FR-20:** Strip nonessential metadata (including EXIF GPS) from provider-bound normalized copies. Preserve original bytes untouched.
- **FR-21:** Define bounded normalization for backend-supported formats. Animated images are treated as a single documented frame or rejected; behavior must not be silent.
- **FR-22:** Validate dimensions, total pixels, bytes, and mask compatibility before provider invocation.
- **FR-23:** Invoke the gateway through the installed AI SDK structured image-edit prompt where compatible; isolate provider-specific options in the route adapter, not in UI or agent prompts.
- **FR-24:** Apply provider and total-operation timeouts with abort signals.
- **FR-25:** Capture provider request ID, selected model, warnings, revised prompt when returned, usage, and timing in sanitized operational metadata.

### Storage, artifacts, and versions

- **FR-26:** Preserve all source blobs. A successful edit creates a new file under a user-scoped, non-user-controlled storage key.
- **FR-27:** Introduce a durable image artifact/version record rather than treating tool output URL as the source of truth.
- **FR-28:** The record must include: ID, user ID, chat ID, project ID when applicable, source user-turn index, producing assistant/tool-call identity, kind (`uploaded`, `generated`, `edited`), direct parent ID, root ID, prompt/instruction, optional mask ID, status, MIME, bytes, width, height, checksum, storage key/URL, selected route/model, attempt count, sanitized failure code/detail, created/updated/completed timestamps, and soft-deletion/missing-file state.
- **FR-29:** Lineage forms a directed acyclic graph. Parent and root must belong to the same user; database/application constraints prevent self-parenting and cycles.
- **FR-30:** Generated images must be adopted into the same artifact model so they can be edited and appear in future Library work. Existing historical generation events may remain legacy read-only URLs unless a safe backfill can prove ownership and file existence.
- **FR-31:** Use SHA-256 (or repository-standard cryptographic checksum) to verify immutability and detect missing/corrupt storage, not to deduplicate user intent automatically.
- **FR-32:** Write result bytes atomically before marking the artifact `ready`. A partial file or failed write leaves a failed attempt and no ready version.
- **FR-33:** The tool output and timeline persist the artifact ID and authorized API URL, not an internal filesystem path.
- **FR-34:** Replaying/reconnecting the same completed Eve tool call must not invoke the provider or create a duplicate version. Idempotency is keyed by user + chat/session + tool-call ID.

### Lifecycle

- **FR-35:** A failed attempt is not a version node available for future editing.
- **FR-36:** Deleting a child version never deletes ancestors or siblings.
- **FR-37:** Deleting a version with descendants is soft-delete/tombstone by default so lineage remains valid; the backing blob may be removed only according to a documented retention policy.
- **FR-38:** Deleting a chat must follow the existing chat retention semantics. This feature must not silently delete artifacts that future Library behavior expects to survive without an approved lifecycle decision.
- **FR-39:** Missing backing files are explicit (`missing`) and render an actionable state rather than a broken image.

## 10. Proposed architecture

```text
Browser composer/result action
  -> existing image upload or selected artifact reference
  -> Eve message + authenticated principal
  -> agent intent/source resolution
  -> edit_image tool
       1. authorize source/mask
       2. idempotency check / create attempt
       3. capability router
       4. decode, validate, normalize, strip metadata
       5. AI SDK image edit -> AI_GATEWAY_BASE_URL/images/edits
       6. validate/decode provider output
       7. atomic local blob write
       8. create/complete immutable artifact version
       9. return artifact ID + authorized URL + metadata
  -> durable Eve event/tool result
  -> timeline renders progress/result/failure
  -> /api/artifacts/:id/file authorizes bytes per request
```

### 10.1 Recommended modules and boundaries

Names are proposed and may change during approved implementation only if equivalent responsibilities remain explicit.

- `agent/tools/edit_image.ts`: narrow authenticated tool contract and orchestration call.
- `lib/image-editing/types.ts`: stable request/result/error/capability types.
- `lib/image-editing/router.ts`: deterministic eligible-route selection and bounded fallback.
- `lib/image-editing/capabilities.ts`: configuration parsing, live-catalog intersection, probe cache, health state.
- `lib/image-editing/normalize.ts`: decoder validation, metadata stripping, dimensions/pixels/format normalization, mask checks.
- `lib/image-editing/provider.ts`: AI SDK/gateway adapter and error normalization.
- `lib/image-artifacts.ts`: owned lookup, idempotency, lineage validation, transitions, atomic completion.
- `lib/local-blob.ts`: extend to return/accept opaque storage keys and atomic writes; avoid URL parsing as the delete authority.
- `app/api/artifacts/[id]/route.ts`: authorized metadata.
- `app/api/artifacts/[id]/file/route.ts`: authorized bytes/download response.
- `components/timeline/parts.ts` and `components/timeline/nodes/research.tsx`: classify and render `edit_image` separately from generation.
- `components/chat/*` / `components/research-chat.tsx`: stage explicit artifact references and "Edit this image."
- `lib/db/schema.ts` plus committed migration: artifact/version/attempt persistence.

### 10.2 State machine

Attempt states:

```text
queued -> validating -> routing -> processing -> storing -> succeeded
   |          |           |          |           |
   +----------+-----------+----------+-----------+-> failed
                                   processing -> cancelled/timeout
```

Artifact version states:

```text
pending -> ready
pending -> failed (not eligible as a parent)
ready -> deleted (tombstone)
ready -> missing (reconciliation detects absent/corrupt blob)
```

State transitions must be conditional/idempotent; a late provider response cannot overwrite a timeout/cancel terminal state without an explicit reconciliation policy.

## 11. Storage and versioning design

### 11.1 Data model

Prefer a generalized `artifact` table plus image-specific metadata, because generated images and the future Library need the same durable primitive. If implementation chooses an image-specific table first, it must preserve a migration path to generalized artifacts without changing IDs or lineage.

Suggested records:

1. **`artifact`**: owner/provenance/lifecycle and storage metadata.
2. **`image_edit_attempt`**: one or more provider attempts linked to a pending/result artifact and idempotency key.
3. Optional **`image_route_health`** only if process-local cache is insufficient for multi-replica consistency; otherwise keep health ephemeral and observable.

Required indexes/constraints:

- unique `(user_id, tool_call_id)` idempotency key;
- index `(user_id, created_at)` for future Library listing;
- index `(chat_id, created_at)` for timeline rehydration;
- index `(parent_artifact_id, created_at)` for lineage children;
- parent/root foreign keys with deletion restricted or tombstoned;
- check constraints for valid kind/status combinations where Drizzle/Postgres can express them safely.

### 11.2 Storage keys

- Source uploads and generated/edited outputs use opaque server-created keys under the owner namespace, for example `artifacts/<user-id>/<artifact-id>/original.<ext>`.
- Do not derive keys from prompt, filename, chat title, model ID, or other private/user-controlled text.
- Persist storage key separately from delivery URL. URLs are constructed at request time from artifact ID.
- Result writes use temp-file + fsync/close + atomic rename on the same volume where supported.
- Compute checksum and dimensions from finalized bytes before the database transition to `ready`.

### 11.3 Version semantics

- Uploaded or generated source is root version `v1` for its lineage.
- Every edit points to exactly one direct parent and the same root.
- Display labels may use branch-aware "Version" language, but numeric labels are presentation only; parent IDs are the authority.
- No automatic pruning or overwrite in this PRD.
- Retention policy applies to blobs and rows together and must preserve tombstone lineage.

### 11.4 Existing data migration

- Add committed schema migration with nullable/new tables so existing uploads/chats remain readable.
- New uploads create artifact rows transactionally with document metadata or through a reconciled two-write flow.
- New generated images create artifact rows immediately.
- Historical uploaded images may be backfilled because `document.userId`, `blobUrl`, chat/project/turn, MIME, size, and timestamps exist. Backfill must be idempotent and report missing blobs.
- Historical generated images exist only in Eve tool outputs/local files and may lack a direct database owner mapping. Do not infer ownership from URL alone. Leave them as legacy timeline images unless chat-event provenance can be verified in a reviewed migration script.
- Migration rollback must not delete blobs or existing document rows.

## 12. Privacy, security, and lifecycle

- **PRIV-1:** Images are private user data. Source/mask/output bytes must be sent only to the configured AI gateway route selected for that request.
- **PRIV-2:** The UI should disclose in deployment/privacy documentation that editing transmits image bytes and instructions to the operator-configured gateway/provider.
- **PRIV-3:** Strip EXIF and other nonessential metadata from provider-bound normalized copies and edited outputs unless preservation is explicitly required later.
- **PRIV-4:** Never log base64, binary bodies, gateway keys, Authorization headers, internal storage paths, or full signed/private URLs.
- **PRIV-5:** Prompts may contain sensitive text. Default logs store a redacted/hashed or length-only form; the database may store the instruction for provenance only under the user's authorized artifact record.
- **PRIV-6:** Add CSRF/session protections consistent with current authenticated APIs; authorize every metadata and file request.
- **PRIV-7:** Send `X-Content-Type-Options: nosniff`, a safe `Content-Disposition`, and a private/no-store or explicitly bounded private cache policy for artifact bytes.
- **PRIV-8:** SVG is not an accepted editable raster source or generated response unless sanitized and separately approved. Provider output advertised as an unexpected executable/document MIME is rejected.
- **PRIV-9:** Enforce decoder/pixel limits to prevent decompression bombs and memory exhaustion. Limits apply before normalization and after provider decode.
- **PRIV-10:** Rate-limit edits per user and cap concurrent in-flight edits to prevent accidental spend/runaway work. Exact defaults are an operator decision in section 19.
- **PRIV-11:** Provider safety/moderation failures are surfaced without trying to bypass them through another model.
- **PRIV-12:** Deletion must be auditable and scoped. Database deletion without blob deletion and blob deletion without a corresponding row state are both observable reconciliation failures.

## 13. Automatic backend routing

### 13.1 Configuration contract

Add a dedicated environment-backed schema, proposed as `IMAGE_MODELS_JSON`, rather than stretching chat-only `AI_MODELS_JSON`. Example shape (illustrative, not locked syntax until approval):

```json
{
  "gpt-image-2": {
    "enabled": true,
    "priority": 10,
    "capabilities": {
      "generate": true,
      "edit": true,
      "mask": true
    },
    "acceptedInputMimeTypes": ["image/png", "image/jpeg", "image/webp"],
    "maxInputBytes": 52428800,
    "maxInputPixels": 25000000,
    "outputFormat": "png",
    "providerOptions": {
      "inputFidelity": "high"
    }
  }
}
```

- Schema-validate at startup and fail fast on malformed configuration.
- Unknown model IDs are allowed as dormant metadata but become eligible only when present in the live gateway catalog.
- Capability claims are conservative. Absence of `edit: true` means not eligible.
- The server stores an allowlist of provider-specific options. Do not accept arbitrary options from the model or user.

### 13.2 Capability probe

- Probe each configured edit route with a documented, bounded fixture in deployment validation, not on every user request.
- Startup/runtime health may use a cached non-billable contract probe where the gateway offers validation semantics, but a 400 missing-field response proves route shape only, not successful editing.
- Production eligibility requires a successful canary edit of a synthetic non-private fixture during deployment acceptance.
- Cache capability results with timestamp and status (`unknown`, `contract-only`, `qualified`, `degraded`, `unsupported`).
- Do not transmit user images to probe capability.

### 13.3 Selection and fallback

1. Intersect configured routes with the live catalog.
2. Require qualified `edit` capability and mask capability if requested.
3. Filter by source MIME/bytes/pixels and requested output needs.
4. Sort by priority, then stable model ID.
5. Attempt the first route.
6. On a transient, route-specific failure, retry according to bounded policy and then try the next eligible route.
7. Stop immediately on moderation, invalid input, credential failure, ownership failure, or global storage failure.
8. Persist every attempt's normalized status and timing.

### 13.4 Unsupported backend behavior

- **No image endpoint:** `IMAGE_EDIT_UNSUPPORTED`; operator detail says gateway lacks `/images/edits`.
- **Generation-only route:** `IMAGE_EDIT_UNSUPPORTED`; user message explicitly says this deployment can generate images but cannot edit existing ones.
- **Edit route unqualified/unknown:** fail closed, not optimistic routing.
- **Mask requested but unsupported:** `IMAGE_EDIT_MASK_UNSUPPORTED`; suggest retrying without a mask only if that preserves the user's intent.
- **All routes temporarily degraded:** `IMAGE_EDIT_TEMPORARILY_UNAVAILABLE`; preserve retry action.
- Never convert an edit request into `generate_image` as fallback.

## 14. Failure taxonomy and recovery

| Code | Trigger | Retry policy | User-facing recovery |
|---|---|---|---|
| `IMAGE_SOURCE_REQUIRED` | No resolvable source | No automatic retry | Attach or select an image |
| `IMAGE_SOURCE_AMBIGUOUS` | Multiple plausible sources | No backend call | Choose one image |
| `IMAGE_SOURCE_NOT_FOUND` | Missing/inaccessible/deleted ID | No retry | Reattach or select an accessible image |
| `IMAGE_SOURCE_NOT_READY` | Upload/previous result incomplete | Retry after state changes | Wait or retry upload |
| `IMAGE_INPUT_UNSUPPORTED` | MIME/decoder/dimensions/pixels/animation invalid | No automatic retry | Upload a supported raster image |
| `IMAGE_MASK_INVALID` | Wrong size/format/alpha contract | No automatic retry | Correct/remove mask |
| `IMAGE_EDIT_UNSUPPORTED` | No qualified route | Retry only after operator config changes | Explain deployment limitation |
| `IMAGE_EDIT_MASK_UNSUPPORTED` | No eligible mask route | No automatic retry | Remove mask or contact operator |
| `IMAGE_EDIT_AUTH_REQUIRED` | No valid per-user/shared gateway credential | No provider retry | Configure gateway access |
| `IMAGE_EDIT_RATE_LIMITED` | App/provider 429 | Respect retry-after; bounded | Retry later |
| `IMAGE_EDIT_MODERATION_BLOCKED` | Provider policy/safety rejection | No fallback bypass | Revise request if appropriate |
| `IMAGE_EDIT_TIMEOUT` | Total/provider timeout | One bounded retry/fallback if safe | Retry |
| `IMAGE_EDIT_PROVIDER_ERROR` | Non-transient provider error | Route-specific policy | Retry or contact operator |
| `IMAGE_EDIT_INVALID_RESPONSE` | Empty/corrupt/unsafe output | Bounded route fallback | Retry |
| `IMAGE_EDIT_STORAGE_FAILED` | Durable write/checksum/DB completion fails | No provider re-call by default; retry storing cached bytes only if securely retained | Retry; no result shown as durable |
| `IMAGE_EDIT_CANCELLED` | User/system cancellation | No automatic retry | Start again |
| `IMAGE_ARTIFACT_MISSING` | DB row exists, blob absent/corrupt | Reconciliation/operator action | Explain file is unavailable |

Failures returned through tool output must be structured (`code`, safe `message`, `retryable`, optional `retryAfterMs`, `attemptId`) so timeline copy does not parse provider strings.

## 15. Observability and cost controls

### 15.1 Structured events/metrics

Emit sanitized events for:

- request accepted/rejected before provider;
- source kind/format/dimensions bucket (not path/bytes);
- routing candidate count and selected model ID;
- capability state and fallback reason;
- provider status/error class/request ID;
- normalize/provider/store/total latency;
- input/output byte and pixel counts;
- result status, artifact ID, parent ID, root ID;
- retry/fallback count;
- storage reconciliation mismatch;
- authorization denial counts without target metadata.

Metrics:

- edit requests, successes, failure rate by stable code;
- latency histograms by model and stage;
- provider fallback frequency;
- bytes stored and output/input ratio;
- active edit concurrency and rate-limit denials;
- missing/corrupt artifact count;
- approximate usage/cost fields where the gateway returns usage.

### 15.2 Logs and diagnostics

- Correlate chat ID, tool-call ID, attempt ID, artifact ID, and provider request ID.
- Never log image bytes, data URLs, secrets, Authorization headers, or full prompt text.
- User-facing timeline remains provider-neutral; operator logs/admin diagnostics may name models.
- Add a deployment validation command that reports route catalog presence, contract probe status, qualified canary result, storage write/read, and cleanup.

## 16. Test and evaluation plan

### 16.1 Unit tests

- Source resolution precedence and ambiguity.
- Ownership filters and non-leaking not-found behavior.
- Configuration schema, live-catalog intersection, and deterministic ordering.
- Route filtering by edit/mask/MIME/bytes/pixels.
- Error normalization and retry/fallback matrix.
- Idempotency key behavior and terminal state transitions.
- Lineage parent/root validation, branching, cycle/self-parent rejection.
- Filename/storage-key sanitization and atomic-write behavior.
- Magic-byte/MIME mismatch, decompression limits, EXIF stripping, dimension extraction, mask validation.
- Timeline `edit_image` classification and structured output parsing.
- Artifact delivery cache/content-disposition/nosniff headers.

### 16.2 API/database integration tests

- Upload image -> artifact row -> attach to turn.
- Authorized source metadata and byte delivery.
- Cross-user document/artifact/source/mask/file requests denied.
- Successful provider stub -> atomic blob -> ready artifact -> tool output.
- Provider succeeds but storage fails -> failed attempt, no ready artifact.
- Duplicate tool-call replay returns existing terminal result with one provider invocation.
- Concurrent duplicate calls serialize/uniquely conflict without duplicate versions.
- Parent deletion creates tombstone while children remain readable.
- Missing blob reconciliation marks `missing`.
- Migration on fresh DB, migration on populated fixture DB, idempotent backfill, and rollback compatibility.

### 16.3 Browser/E2E cases

Use the repository's approved browser automation approach chosen during implementation; add a real E2E harness if none exists rather than treating component snapshots as user-flow proof.

1. Attach PNG + "remove the red cup" -> progress -> result -> reload -> result persists.
2. Click "Edit this image" on result -> "make the wall blue" -> child version appears.
3. Branch twice from the same parent and verify both children/source links.
4. Refer to "last image" and verify deterministic source.
5. Click image A, switch to image B, submit an edit, and verify only image B's durable ID reaches the tool while image A remains unchanged.
6. Clear the active image and verify the composer returns to ordinary chat mode without deleting conversation attachments.
7. Two ambiguous images with no explicit UI selection -> clarification, zero provider calls.
8. Ask "what is in this image?" -> no edit call.
9. Ask to generate a new lighthouse -> generation call, no edit call.
10. Generation-only deployment -> clear unsupported state, no generated substitute.
11. Mask route success and invalid-mask preflight failure.
12. Provider timeout/rate limit/moderation/storage failure states and retry affordances.
13. Cross-user artifact URL/ID denial.
14. Desktop, narrow viewport, touch, keyboard, screen-reader selected state/live region, browser close/back, and reduced motion.

### 16.4 Model routing evals

Create `evals/image-editing.eval.ts` and fixture-driven cases. The eval harness must stub tool execution where needed so routing can be tested without billed image calls.

**Positive edit cases (must call `edit_image` exactly once):**

- attached image: "Remove the person in the background."
- attached image: "Change the wall to sage green but keep everything else."
- prior result selected: "Extend this to a landscape banner."
- explicit previous image: "Restyle version 2 as a watercolor."
- masked request: "Replace only the masked area with flowers."

**Clarification cases (must call neither image tool before asking):**

- two eligible images: "Make it brighter."
- "Edit the logo" when no image is attached or selected.

**Negative routing cases (must not call `edit_image`):**

- "Describe this image."
- "Generate an image of a lighthouse."
- "Chart Q1 120, Q2 145."
- "Crop this PDF page" when PDF editing is unsupported.
- "Can your backend edit images?" (answer capability question; no edit).

**Routing pass thresholds:**

- 100% positive cases call `edit_image` exactly once with a nonempty instruction and authorized source reference fixture.
- 100% clarification cases ask a focused question and call no image tool.
- 100% negative cases avoid `edit_image`.
- 100% generation cases retain correct `generate_image` routing.
- Run each nondeterministic case at least 5 times on every supported default chat model; release requires 100% route-class accuracy across runs. Any miss blocks release because an unintended edit can spend money and create data.

### 16.5 Image quality eval fixtures

Store synthetic, redistributable fixtures under `evals/fixtures/image-editing/` with manifest JSON containing source, optional mask, instruction, invariants, expected change regions, and prohibited changes. Do not use private user photos or fixtures without redistribution rights.

Minimum fixture set:

1. **Object removal:** red cup on plain table; remove cup; background continuity expected.
2. **Object addition:** empty desk; add small green plant at right; rest unchanged.
3. **Background replacement:** product on white background; replace with pale blue; product identity/edges preserved.
4. **Recolor:** blue chair; make chair red; geometry/background unchanged.
5. **Outpaint:** centered square landscape; extend to 16:9; center crop preserved.
6. **Restyle:** simple street scene; watercolor; composition/object count preserved.
7. **Masked local edit:** room + binary/alpha mask over rug; change rug pattern only.
8. **Identity/detail preservation:** synthetic face/character with known attributes; change shirt color only.
9. **Text preservation:** package with short legible synthetic label; change background only.
10. **No-op/minimal edit:** "Increase brightness slightly"; detect destructive regeneration.

For each backend/model candidate, run at least 3 seeds/attempts per fixture where the provider permits, retain outputs in a non-production eval artifact area, and score:

- **Instruction adherence:** automated vision judge rubric 1–5 plus deterministic region/color checks where possible.
- **Preservation:** SSIM/LPIPS or perceptual similarity outside expected change masks; face/identity embedding similarity only on synthetic/consented fixtures.
- **Localization:** changed-pixel/perceptual-difference concentration inside expected region for masked/local edits.
- **Safety/validity:** decodes, allowed MIME, dimensions within contract, no unexpected alpha/executable payload.
- **Human review:** blind A/B rubric for ambiguous visual cases during initial qualification and material model upgrades.

**Backend qualification thresholds:**

- 100% outputs decode and pass security/format checks.
- At least 90% of all attempts score instruction adherence >= 4/5.
- At least 85% of preservation-sensitive attempts meet fixture-specific preservation threshold.
- At least 90% of masked attempts concentrate >= 80% of perceptual change inside mask plus a configured feather margin.
- No critical identity/composition failure on more than 1 of 30 preservation attempts.
- Overall mean human rubric >= 4.0/5, with no fixture category mean below 3.5/5.
- A backend failing thresholds is disabled for `edit` even if its endpoint returns 200.

Threshold calibration must be committed in the fixture manifest and reviewed with sample outputs; do not tune thresholds after seeing a candidate merely to make it pass.

### 16.6 Live gateway/deployment acceptance

Before production enablement:

1. Confirm configured edit models appear in the live catalog.
2. Run contract probe against `/images/edits`.
3. Run one real synthetic canary per enabled route, including mask if claimed.
4. Verify result decode, dimensions, MIME, checksum, storage persistence, authorized delivery, timeline rendering, reload/reconnect, and cleanup.
5. Prove generation-only model/config returns unsupported without fallback generation.
6. Run cross-user denial probes.
7. Verify backup includes DB plus uploads/artifacts and restore can render/download lineage.
8. Record immutable application image ID and route config used for acceptance.

### 16.7 Quality gates

```bash
/opt/data/bin/bun run typecheck
/opt/data/bin/bun run lint
/opt/data/bin/bun test
/opt/data/bin/bun run check
git diff --check
```

Also run focused image-edit tests, `evals/image-editing.eval.ts`, existing `evals/image-generation.eval.ts`, migration tests, browser/E2E suite, and the live synthetic acceptance command. `bun run check` may modify files; inspect the diff and rerun affected tests.

## 17. Acceptance criteria and traceability

| Acceptance ID | Requirement | Verification |
|---|---|---|
| AC-01 | Explicit attached-image edits invoke editing and show durable result | US-001; routing eval positives; E2E 1 |
| AC-02 | Earlier/current-chat image references resolve safely | FR-2–5; source-resolution unit tests; E2E 4–5 |
| AC-03 | Original is never overwritten; every result is immutable child | FR-26–34; checksum/lineage integration tests; E2E 2–3 |
| AC-04 | Any successful version can branch | US-003; lineage unit/integration tests; E2E 3 |
| AC-05 | Routing is automatic, deterministic, and edit-capability gated | FR-10–17; router tests; live acceptance 1–3 |
| AC-06 | Generation-only deployments fail clearly without substitute generation | US-005; unsupported fixture; E2E 8; live acceptance 5 |
| AC-07 | Per-user/shared credentials follow existing gateway policy | FR-8; credential integration fixtures |
| AC-08 | Source/output metadata and bytes are owner-authorized | FR-6–9; cross-user API tests; E2E 11; live acceptance 6 |
| AC-09 | Provider-bound copies strip nonessential metadata and reject unsafe input | FR-18–22; normalization/security tests |
| AC-10 | Timeline covers progress, success, and all stable failure classes | UX-6–13; component tests; E2E 1, 8–10, 12 |
| AC-11 | Reconnect/reload does not duplicate provider work or versions | FR-34; idempotency integration test; E2E reload |
| AC-12 | Masked edits work only on qualified routes | US-008; route/mask tests; E2E 9; canary |
| AC-13 | Storage failures never expose non-durable results | FR-32; storage-failure integration test; E2E 10 |
| AC-14 | Existing uploads remain readable through migration/rollback | migration populated fixture; rollback rehearsal |
| AC-15 | Agent does not confuse edit/generate/analyze/chart intents | routing eval suite at 100% class accuracy |
| AC-16 | Enabled backend meets objective quality thresholds | fixture manifest, automated scoring, human qualification report |
| AC-17 | Backup/restore includes rows, blobs, and lineage | deployment acceptance 7 |
| AC-18 | No secrets/private bytes in logs/events | log capture tests and security review |
| AC-19 | A user can select and switch among multiple current-chat images with one unmistakable active edit target | US-009; UX-2, UX-6–15; FR-2A; E2E 5–7, 14 |

Release requires every AC to have passing evidence. A health endpoint alone is not acceptance evidence.

## 18. Ordered implementation task decomposition

Derive execution TODOs from this list only after explicit PRD approval. Keep one implementation TODO in progress at a time unless an approved delegation plan says otherwise.

1. **T-01: Lock open product/operator decisions.** Resolve section 19, finalize route config schema, limits, retention, cancellation, and artifact generalization. No code before this gate.
2. **T-02: Build live gateway spike and fixtures.** Create synthetic source/mask, verify exact AI SDK request/response for each candidate route, accepted formats, options, timeout, moderation/error shapes, and mask semantics. Keep spike artifacts outside production data and document findings.
3. **T-03: Add stable domain types/error taxonomy.** Create image-edit request/result/capability/status/error types and unit tests.
4. **T-04: Add route configuration and startup validation.** Parse dedicated image model metadata, intersect live catalog, fail fast on malformed config, and test dormant/unknown/generation-only/edit-capable entries.
5. **T-05: Implement capability qualification/probe abstraction.** Add contract/canary status model, cache, diagnostics, and tests without user data.
6. **T-06: Add artifact/version schema and committed migration.** Include constraints/indexes/idempotency/attempt records; generate migration; test fresh/populated DB and rollback compatibility.
7. **T-07: Add safe migration/backfill path.** Backfill owned upload images idempotently, report missing blobs, leave unverifiable legacy generated URLs untouched.
8. **T-08: Refactor local storage for opaque keys and atomic writes.** Add checksum/dimensions metadata, safe delete/read APIs, and failure-injection tests while preserving existing uploads.
9. **T-09: Add authorized artifact metadata/file APIs.** Enforce owner checks, safe headers, download names, missing/tombstone states, rate limits, and cross-user tests.
10. **T-10: Integrate new uploads and image generation with artifact records.** Preserve document behavior; make all new source/generated images editable and durable; retain existing generation evals.
11. **T-11: Implement image normalization/security pipeline.** Decoder/magic-byte checks, pixel/byte limits, EXIF stripping, format normalization, animation policy, mask validation, and malicious fixture tests.
12. **T-12: Implement deterministic router and retry policy.** Eligibility filtering, priority, transient fallback, no generation fallback, sanitized attempts, and exhaustive matrix tests.
13. **T-13: Implement provider adapter with user credential.** Use structured AI SDK editing prompt, abort/timeouts, provider options allowlist, response validation, metadata capture, and stub integration tests.
14. **T-14: Implement artifact orchestration/idempotency.** Authorize source/mask, create attempt/pending artifact, call pipeline, atomically store/complete, handle duplicate/reconnect/concurrency, and test every failure edge.
15. **T-15: Add `edit_image` Eve tool and agent instructions.** Principal-derived execution, narrow schema, source resolution contract, no provider details in model-facing input, and structured output.
16. **T-16: Add routing eval suite.** Positive/clarification/negative fixtures across supported default chat models; meet 100% class thresholds.
17. **T-17: Add timeline classification/rendering.** Dedicated editing node, progress/source thumbnail/result/provenance/failures/retry, durable replay, accessibility, motion tokens, and component tests.
18. **T-18: Add multi-image focused editing workspace and composer flow.** Add consistent image-local entry points, current-chat eligible-image navigation, one active source state, selected styling/semantics, composer source context, atomic switching/clearing, preserved normal upload/analyze/generate behavior, ambiguity handling, responsive/touch/accessibility states, and browser checks. Adapt to MiniScira's design system rather than copying the reference UI.
19. **T-19: Add browser/E2E harness and cases.** Cover all cases in 16.3 with provider/storage stubs and authorization fixture users.
20. **T-20: Add image-quality eval runner and fixtures.** Commit manifest, automated scorers, report format, thresholds, and human review packet; qualify each enabled route.
21. **T-21: Add observability and reconciliation.** Sanitized metrics/logs, missing/corrupt blob scanner, storage/DB mismatch alerts, and no-secret log tests.
22. **T-22: Update deployment/privacy/backup documentation.** `.env.example`, `docs/DEPLOYMENT.md`, capability matrix, provider disclosure, backup/restore, troubleshooting, rate/cost limits, and unsupported behavior.
23. **T-23: Run full verification.** Focused tests, full quality gates, routing eval, quality eval, migration rehearsal, browser/E2E, security review, diff review.
24. **T-24: Deploy to a candidate image and run synthetic production acceptance.** Back up DB/uploads, apply migration explicitly, recreate services, verify both processes plus real edit flow, reconnect/reload, authorization, generation-only behavior, backup/restore sample, logs, and cleanup.
25. **T-25: Production rollout and source-control completion.** Roll out enabled routes gradually, monitor failure/latency/cost, retain previous immutable image, commit/push intended changes, verify clean tree and local HEAD equals `origin/main`.

### Task-to-acceptance mapping

- T-03/T-11/T-12 -> AC-05, AC-06, AC-09, AC-12
- T-06/T-07/T-08/T-09/T-10/T-14 -> AC-03, AC-04, AC-07, AC-08, AC-11, AC-13, AC-14, AC-17
- T-15/T-16 -> AC-01, AC-02, AC-15
- T-17/T-18/T-19 -> AC-01, AC-02, AC-04, AC-06, AC-10, AC-11, AC-12
- T-20 -> AC-16
- T-21/T-22 -> AC-17, AC-18
- T-23/T-24/T-25 -> all ACs as final evidence gates

## 19. Deployment plan

### 19.1 Pre-deployment

- Explicitly approve this PRD and derived implementation TODO/test/eval plan.
- Back up Postgres and the complete uploads/artifacts volume together.
- Retain the previous immutable application image ID/tag and current environment/Compose configuration.
- Validate migration on a restored production snapshot.
- Qualify each configured edit route with synthetic fixtures; do not mark route `edit: true` solely from catalog presence.
- Default the feature off with an operator feature flag, proposed `IMAGE_EDITING_ENABLED=false`, until schema, app, and route acceptance all pass.

### 19.2 Rollout

1. Deploy schema-compatible app image with feature off.
2. Run one-shot committed migration; verify existing uploads/chats.
3. Enable one qualified route for an operator or canary user if the server has an allowlist. Otherwise, enable it during a quiet window with strict rate and concurrency limits.
4. Run live synthetic edit, mask (if enabled), reload/reconnect, source/result delivery, cross-user denial, and cleanup.
5. Monitor error codes, p50/p95, route fallbacks, storage mismatches, volume growth, and provider usage/cost.
6. Expand enablement only after acceptance thresholds hold.

### 19.3 Production acceptance

- Both `/api/health` and `/eve/v1/health` pass, but these are prerequisites only.
- Real synthetic edit succeeds end-to-end and remains after reload/reconnect.
- Original checksum remains unchanged; result has new checksum/ID/key and correct parent/root.
- Unsupported-generation-only configuration returns the specified failure.
- Authorized file response works; cross-user probes fail.
- DB and upload backup can restore a sampled lineage.
- No secrets/base64/private paths appear in logs.
- Repository source-control invariants pass after deployment.

## 20. Rollback plan

### 20.1 Feature-level rollback

- Set `IMAGE_EDITING_ENABLED=false` and recreate the app. Existing artifacts remain viewable; no new edit calls are accepted.
- Disable a failing route in image model config without disabling generation or chat.

### 20.2 Application rollback

- Recreate services with the prior immutable image.
- Previous code must tolerate additive artifact tables/columns. This compatibility must be tested before deployment.
- Do not automatically down-migrate or delete artifact rows/blobs.

### 20.3 Data rollback

- If a migration is incompatible with the prior image, restore the pre-deployment database and matching uploads volume backup together.
- Preserve post-deployment edited outputs separately before full restore if users created valuable artifacts; reconciliation/import requires a reviewed procedure, not ad hoc file copying.
- A rollback never overwrites originals or bulk-deletes user files.

### 20.4 Rollback triggers

- authorization/data-leak defect;
- source overwrite/checksum mutation;
- duplicate edit/provider billing on reconnect at meaningful frequency;
- corrupt/missing result rate above 1%;
- unbounded retry/cost behavior;
- migration or restore failure;
- critical moderation bypass or secret/image leakage in logs.

## 21. Open questions requiring approval

1. **Artifact schema:** approve a generalized `artifact` table now (recommended) or an image-only table with later migration?
2. **Lifecycle:** should artifacts survive source-chat deletion for the future Library, or follow chat deletion until Library is implemented? Recommended: retain as user-owned artifacts and tombstone chat provenance.
3. **Feature flag:** deployment-wide flag only, or also a canary user allowlist?
4. **Default limits:** maximum input/output bytes, pixel count, dimensions, concurrent edits per user, requests per minute/day, and total timeout.
5. **Animated input:** reject GIF/animated WebP/AVIF for editing (recommended initially) or normalize the first frame with explicit UI warning?
6. **HEIC/BMP:** normalize on the server if a safe decoder is available, or reject for editing while retaining vision-upload support?
7. **Mask UX:** the reference screenshots demonstrate a useful localized-selection mode, but the current request explicitly locks multi-image target selection, not a painter. Is the first release allowed to expose masks through a second attachment role, or should a visual brush/mask mode become required? Current recommendation: keep the painter out of the first implementation unless separately approved.
8. **Workspace presentation:** should the focused editor use an expanded in-chat surface or a route-backed full-screen overlay that returns to the same scroll position? Recommendation: route-backed responsive overlay on desktop and mobile, with the chat retained underneath and browser back closing the editor.
9. **Prompt provenance:** store the full edit instruction in the artifact record (recommended for version history) or redact after a retention period?
10. **Cancellation:** should the UI expose Cancel when provider cancellation cannot guarantee avoided billing, or only show timeout/retry?
11. **Fallback:** how many automatic transient attempts and route fallbacks are acceptable? Recommended: max 1 retry on the same route and max 1 alternate route, bounded by one total deadline.
12. **Output format:** preserve provider output when safe, or normalize all edited results to PNG initially? Recommended: PNG for deterministic quality/alpha, with JPEG/WebP later for storage efficiency.
13. **Provider disclosure:** what exact privacy copy should explain that bytes leave the MiniScira host for the configured gateway/provider?
14. **Historical generated images:** invest in a verified chat-event backfill now, or leave old generation URLs as legacy and only register new outputs? Recommended: new outputs only unless ownership can be proven automatically.
15. **Human quality review owner:** who approves backend qualification reports and model upgrades?
16. **Route source of truth:** approve `IMAGE_MODELS_JSON`, or does the gateway have a reliable capability endpoint that should become authoritative in addition to `/models`?

## 22. Decisions locked unless PRD is revised

- Original images are immutable; each successful edit is a new durable artifact/version.
- Image editing uses a dedicated tool and route, not generation fallback.
- Ordinary users do not choose providers or image models.
- Eligibility requires explicit edit capability plus live availability and qualification.
- Ownership is enforced from authenticated principal through metadata and byte delivery.
- Provider-bound images use server-read bytes, not private-host URLs.
- Generated and edited images converge on a durable artifact model compatible with the future Library.
- A conversation may contain many eligible images, but each edit has exactly one explicit active source selected by durable artifact ID.
- The active source is visibly and accessibly represented on both the image surface and composer; switching targets is deliberate and atomic.
- The focused editing UX takes interaction principles from the supplied references but uses MiniScira's own design system and component vocabulary.
- Durable Eve tool events remain the progress/reconnect source; no browser-only job system.
- Failed attempts are not editable versions.
- No implementation begins until explicit approval and derived TODO/test/eval plan.

## 23. Codex/implementation handoff contract

When approved, the implementation packet must state:

- **Source of truth:** this PRD, `AGENTS.md`, `docs/PRODUCT_PLANNING.md`, `docs/ENGINEERING_INVARIANTS.md`, `docs/DEVELOPMENT_PRINCIPLES.md`, `docs/DEPLOYMENT.md`, and approved answers to section 21.
- **Repository:** `/opt/data/miniscira-src`; preserve current branch/worktree and unrelated changes.
- **Likely affected areas:** `agent/tools`, `agent/instructions`, `app/api`, `components/research-chat.tsx`, `components/timeline`, `hooks/use-chat-attachments.ts`, `lib/db/schema.ts`, `lib/db/migrations`, `lib/gateway*`, `lib/local-blob.ts`, `evals`, `.env.example`, deployment docs, and new image-edit/artifact modules.
- **Runtime constraints:** Docker-first two-process Next.js/Eve image; explicit migrations; durable `/data/uploads`; OpenAI-compatible gateway; per-user/shared credentials; private-host attachment restriction; Umbrel deployment managed through immutable images/Compose.
- **Non-goals:** section 7.2; no opportunistic redesign/refactor/provider controls.
- **Execution:** follow tasks T-01 through T-25 in order, stopping on unresolved ambiguity.
- **Verification:** section 16 plus AC traceability and production acceptance.
- **Reporting:** file-level changes, migration impact, real command/eval/browser/live acceptance evidence, residual risks, deployment image ID, rollback readiness.

Implementation agents must follow the approved PRD exactly, ask/stop if ambiguity remains, avoid scope expansion, run all mapped verification, and never claim success from stubs, mocked-only flows, or health checks alone.

## 24. Approval gate

This PRD is not implementation authorization. The next step is user review and explicit approval or requested revisions. After approval, record it in this PRD and create the execution TODO, test, and eval plan from section 18. Keep the backlog status `To do` until implementation starts.
