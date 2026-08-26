# PRD: nightly memory extraction

- **Status:** To do
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-nightly-memory-extraction)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Not approved
- **Repository:** `/opt/data/miniscira-src`
- **Last updated:** 2026-08-23

## 1. Introduction

MiniScira currently stores durable per-user memories only when the live agent calls the `remember` tool. Those memories are simple `memory` rows, are injected into each later authenticated user session, can be listed, and can be deleted. Useful facts are therefore missed when the live agent does not call the tool, while automatic extraction without strict limits would create serious risks: saving secrets, transient work, unsupported conclusions, duplicates, or contradictory facts.

This feature adds an optional nightly, per-user process that examines chats with real user activity during the user's most recently completed local calendar day. It extracts strictly defined durable-memory candidates, applies deterministic and model-based safety checks, records source provenance, and presents candidates for user review. Initial releases do **not** automatically promote extracted candidates into active memory. The architecture must still support a later opt-in auto-promotion mode, gated by explicit confidence, contradiction, audit, evaluation, and operational thresholds defined in this PRD.

The feature must use MiniScira's existing self-hosted architecture: Postgres is the durable source of truth, Eve supplies a minute tick, due work is claimed through in-database leases, and no external scheduler or queue is introduced.

## 2. Context and existing constraints

### 2.1 Existing memory behavior

- `memory` currently contains only `id`, `userId`, `content`, and `createdAt`.
- `lib/memories.ts` lists, saves, and deletes memory, with a maximum of 100 memories per user and 500 characters per memory.
- `agent/tools/remember.ts`, `forget.ts`, and `list_memories.ts` provide agent access.
- `agent/instructions/10-memories.ts` injects every saved memory into the system prompt of a newly started authenticated user session.
- `components/settings-memories.tsx` and `/api/memories*` let a signed-in user inspect and delete active memories, but not edit them or review candidates.
- `evals/memory.eval.ts` verifies explicit tool-based memory persists across sessions.

### 2.2 Existing chat/event behavior

- Chat transcripts are ordered `chat_event` rows keyed by unique `(chat_id, seq)`.
- Persisted Eve events are opaque; only `eventType()` in `lib/chat-events.ts` may read `.type` directly. New transcript parsing must add and use exported predicates/accessors there rather than inspecting `.type` elsewhere.
- `client.message.submitted` is the authoritative persisted projection of a real user submission and carries its own `createdAt` value. `chat.updatedAt` cannot stand in for user activity because background event flushing and cursor updates also touch it.
- Retries and edits can persist `client.superseded` markers. Superseded user/assistant turn pairs must not be treated as current evidence.
- A chat log may span multiple Eve sessions and may contain failed, cancelled, or incomplete turns.

### 2.3 Existing scheduling behavior

- Eve's Lookouts schedule emits a minute tick.
- Due Lookouts are atomically claimed with an in-database `leasedUntil` field, bounded batches, and retry scheduling.
- No QStash or other external queue is used.
- Nightly extraction must reuse this dynamic-scheduling pattern without making memory processing depend on Lookout rows or Lookout cron semantics.

## 3. Product principles and locked decisions

These decisions apply to the first implementation. Development must not change them without revising and approving the PRD:

1. **Opt-in:** nightly extraction is disabled by default for existing and new users.
2. **Review first:** all model-extracted memories initially enter `pending_review`; none affect answers until the user accepts them.
3. **Explicit manual memory remains immediate:** a user's direct "remember this" request and the existing `remember` tool continue to create an active memory immediately, subject to the same secret/sensitive-data validation used by the new pipeline.
4. **Closed local day:** each normal run processes the immediately preceding completed calendar day in the user's configured IANA timezone, represented as an exact half-open UTC interval `[local midnight, next local midnight)`.
5. **Nightly target time:** due time is 02:00 local time. This avoids running at the day boundary and gives event persistence time to settle. DST conversion uses the IANA timezone database; local-day windows may contain 23, 24, or 25 hours.
6. **User activity, not chat timestamp:** eligibility requires at least one non-superseded `client.message.submitted` event whose event-level timestamp falls in the target interval.
7. **User-authored evidence only:** a candidate must be grounded in a user-authored message. Assistant claims, tool output, fetched pages, project instructions, uploaded-document content, and generated Lookout chats cannot independently create a personal memory.
8. **No secret storage:** raw candidate text, model explanations, logs, audit metadata, and provenance excerpts must not persist detected secrets. Rejected secret-like text is represented only by categorical reason codes and safe metadata.
9. **Provenance is mandatory:** every extracted candidate and promoted memory records source chat and event/turn range. A candidate without valid owned-source provenance is rejected.
10. **Active-memory retrieval only:** only `active` memories enter agent instructions or `list_memories`; pending, rejected, superseded, deleted, and quarantined records never influence answers.
11. **One canonical memory record:** manually saved and promoted extracted memories use the same active-memory table and retrieval contract.
12. **No embeddings in v1:** candidate-to-memory deduplication uses normalized exact keys plus a bounded model comparison against a shortlist. Do not add a vector index solely for this feature until measured need justifies it.
13. **Auto-promotion off in initial release:** schema and audit contracts may support it, but the UI/API must not expose an enabled auto-promotion setting until all auto-promotion gates in Section 12 pass and a later explicit product approval enables it.
14. **Hard deletion is user-visible behavior:** deleting a memory removes it from retrieval immediately. Minimal tombstone/audit metadata may remain to prevent silent re-creation, but must not retain the deleted content.
15. **No external scheduler or queue:** scheduling, leases, checkpoints, retries, and run state are stored in Postgres and driven by Eve's existing minute-tick process.

## 4. Goals

- Recover durable, useful user context that was clearly stated in chats but not explicitly stored.
- Keep false memories, secrets, transient details, and unsupported inferences out of active memory.
- Give users clear review, correction, deletion, source, and status controls.
- Preserve strict per-user isolation throughout extraction, review, retrieval, and audit operations.
- Make every run safe to retry, resume, and replay without duplicate candidates or memories.
- Bound model cost, transcript size, database load, concurrency, and retained data.
- Establish measurable quality gates for candidate extraction and any future auto-promotion.

## 5. Non-goals

- Building a general search engine over prior chats.
- Summarizing each day or producing a daily digest.
- Saving temporary TODO state, current task progress, deadlines that have passed, one-off requests, ephemeral moods, or conversational small talk.
- Treating assistant output, web sources, tool output, uploaded documents, or Lookout output as evidence about the user without explicit user confirmation.
- Inferring protected or highly sensitive attributes, diagnoses, finances, precise location, credentials, authentication data, or legal status.
- Automatically merging project documents into personal memory.
- Creating organization-shared or cross-user memories.
- Introducing a new external worker, queue, cron provider, or vector database.
- Redesigning the overall Settings information architecture.
- Raising the existing 100-active-memory limit without separate evidence and approval.
- Enabling auto-promotion in the first release.
- Reconstructing or retaining source chat content after the user deletes the source chat.

## 6. Definitions

- **Active memory:** a canonical, user-visible memory that is eligible for retrieval and prompt injection.
- **Candidate:** a proposed memory extracted from chat evidence but not yet active.
- **Durable:** expected to remain useful beyond the current task/day, normally for weeks or longer, until changed by the user.
- **Source span:** the smallest ordered range of persisted chat events needed to identify the user-authored evidence, including chat ID and start/end event sequence.
- **Local day:** a calendar date in an IANA timezone, mapped to an exact UTC interval.
- **Promotion:** transition of a reviewed candidate into an active canonical memory.
- **Contradiction:** a candidate and an existing active memory cannot both be true in their current form or represent a newer value for the same subject/attribute.
- **Duplicate:** a candidate adds no material durable information beyond an existing memory or candidate.
- **Sensitive/secret:** credentials, tokens, private keys, session data, payment identifiers, government identifiers, raw authentication or recovery data, or other content barred by Section 11.
- **Checkpoint:** persisted progress that permits a run to continue without reprocessing completed chat slices.

## 7. Eligible users, days, chats, and evidence

### 7.1 Eligible users

A user is due only when all are true:

- nightly memory extraction is explicitly enabled;
- a valid IANA timezone is stored;
- `nextMemoryRunAt <= now`;
- no unexpired lease is held;
- the prior local day has not already completed successfully under the current extractor policy/model version, unless an authorized replay is requested.

Invalid or removed timezones disable scheduling and show a settings error. The system must not fall back to UTC. On first opt-in, the browser may propose an IANA timezone, but the setting stored on the server is authoritative.

### 7.2 Target local day

- A normal run targets the calendar date immediately before the due local date.
- The scheduler computes the UTC start and end instants from the stored IANA timezone.
- DST gaps/overlaps must never cause a local date to be skipped or processed twice.
- Changing timezone affects future target days only. Historical runs retain the timezone and UTC boundaries used for that run.
- If the service is down, catch-up processes at most the most recent **3 unprocessed local days** per user automatically, oldest first. Older gaps require explicit user/admin replay to prevent surprise cost.

### 7.3 Eligible chats

A chat is eligible when:

- `chat.userId` is the target user;
- it still exists when claimed;
- it contains at least one non-superseded real user submission in the target UTC interval;
- the submission is persisted before the run snapshots the chat's high-water `seq`;
- the chat is not excluded by a future explicit "exclude from memory" control.

A chat created by a Lookout is not eligible merely because the Lookout generated it for the user. It becomes eligible only if the user later adds a real, non-superseded submission in the target interval. Only user-authored statements may be evidence.

### 7.4 Eligible transcript content

- Parse the persisted event log through shared `lib/chat-events.ts` predicates/accessors and Eve's reducer when appropriate.
- Consider only user message text that is still current after supersede/edit handling.
- Exclude client context, model-selection markers, system instructions, hidden reasoning, assistant messages as evidence, tool arguments/results, document contents, image OCR, and subagent transcripts.
- Include enough adjacent conversational context to resolve references such as "I prefer the second format," but a candidate must cite the user message that supports it.
- Skip failed submissions and user turns with no recoverable user text.
- Snapshot `max(seq)` per chat at checkpoint creation. Events arriving later are handled by the next run or explicit replay; the current run never moves its high-water mark.

## 8. What may and may not become memory

### 8.1 Allowed categories

Each candidate must be assigned one category:

- `preference`: stable response, style, format, language, units, food, media, workflow, or tool preference.
- `standing_instruction`: a persistent instruction the assistant should normally follow.
- `constraint`: a durable limitation or requirement relevant across future work.
- `recurring_entity`: a person, pet, team, organization, device, service, or place the user repeatedly works with, described only to the necessary sensitivity level.
- `long_lived_project_context`: a durable project goal, architecture decision, ownership fact, or invariant expected to matter in future chats.
- `decision`: a settled choice with future relevance, not merely an option under discussion.
- `interest`: a sustained topic or activity preference stated as ongoing.

### 8.2 Required properties

A candidate must be:

- explicitly supported by user-authored evidence;
- useful in a future, separate conversation;
- phrased as one concise declarative sentence, maximum 500 characters;
- understandable without reproducing the whole transcript;
- no more specific than the evidence;
- attributed to the user or the relevant named project/entity, not to the assistant;
- assigned confidence and durability scores with machine-readable reasons;
- free of secret/sensitive content after deterministic validation.

### 8.3 Always reject

- Passwords, passphrases, API keys, access/refresh tokens, cookies, authorization headers, private keys, seed phrases, OTPs, recovery codes, connection strings containing credentials, or likely credential material.
- Full payment-card, bank-account, government-ID, tax-ID, insurance-ID, medical-record, or similarly regulated identifiers.
- Raw email verification links, password reset links, signed URLs, session IDs, OAuth verifier/state/token material, or internal shared secrets.
- Precise home address or live precise location unless a future, separately approved sensitive-memory mode exists.
- Health diagnoses, sexuality, ethnicity, religion, political affiliation, biometric data, criminal/legal status, or similarly sensitive attributes inferred or stated, unless a future separately approved consent model exists. V1 rejects these rather than trying to infer consent.
- Temporary progress ("I am on step 3"), one-time requests ("make this answer short"), present-session state, fleeting mood, unconfirmed plans, brainstorming options, speculative conclusions, assistant suggestions, and facts copied only from external content.
- Dates/commitments that are already expired at extraction time, unless they encode a durable recurring preference or historical project decision.
- Candidate text that includes unexplained raw UUIDs, hashes, tokens, internal IDs, IP addresses, ports, or file-system credentials. Necessary non-secret public identifiers require explicit allowlisting and review.

## 9. Functional requirements

### 9.1 Settings and scheduling

- **FR-001:** The system must expose an authenticated per-user toggle for nightly extraction, default off.
- **FR-002:** The system must store a validated IANA timezone and show the next scheduled local run.
- **FR-003:** Enabling extraction must compute the next 02:00 local due instant without retroactively scanning more than the automatic catch-up limit.
- **FR-004:** Disabling extraction must prevent new claims; an already running leased job may finish but its candidates remain review-only.
- **FR-005:** The Eve minute tick must claim due users in bounded batches via an atomic database lease.
- **FR-006:** Overlapping ticks and multiple application replicas must not process the same user/day concurrently.
- **FR-007:** Success must advance to the next local 02:00 slot; retryable failure must release/expire safely and use bounded exponential backoff with jitter.
- **FR-008:** A poison run must stop after a configured attempt limit, enter `failed`, expose a safe error category, and not block all future dates indefinitely.

### 9.2 Extraction and validation

- **FR-009:** A run must persist the target local date, timezone, UTC boundaries, extractor policy version, model ID, prompt/schema version, attempt count, and status.
- **FR-010:** The system must discover eligible chats from event-level user activity, not `chat.updatedAt` alone.
- **FR-011:** Each chat checkpoint must snapshot its high-water event sequence and record progress/status independently.
- **FR-012:** Transcript projection must exclude superseded, failed, hidden, non-user, and unsupported content as defined in Section 7.
- **FR-013:** The extraction model must return strict structured output. Invalid output is rejected or retried once with schema repair; free-form text must never be stored as a candidate.
- **FR-014:** Deterministic pre-model and post-model secret/sensitive filters must run. A positive high-severity match rejects the candidate regardless of model confidence.
- **FR-015:** Each accepted candidate must contain category, normalized content, confidence, durability score, evidence source span, and safe reason codes.
- **FR-016:** The system must reject candidates whose cited source span is outside the snapshotted chat range, belongs to another user, lacks a user-authored message, or does not textually/semantically support the candidate.
- **FR-017:** The system must deduplicate candidates within a run, across prior candidates, and against active memories.
- **FR-018:** Exact normalized duplicates must be suppressed deterministically. Semantic duplicate/contradiction decisions must be stored with score, decision, compared record IDs, model/policy version, and safe reason code.
- **FR-019:** Contradictions must never silently overwrite active memory. In review mode, they must be presented as a conflict with explicit keep-existing, replace-existing, edit, or dismiss actions.
- **FR-020:** A run must be idempotent: retry, lease expiry, process restart, duplicate Eve tick, and authorized replay under the same policy version must not create duplicate candidates or active memories.

### 9.3 Review and lifecycle

- **FR-021:** Pending candidates must be visible in Settings under a distinct "Suggestions to review" area and must not be mixed visually with active memories.
- **FR-022:** Each candidate must show concise content, category, confidence band (not misleading precision), source chat title/link when the chat still exists, source date, and conflict status.
- **FR-023:** The user must be able to accept, edit-and-accept, dismiss, and inspect provenance.
- **FR-024:** Accepting a non-conflicting candidate must atomically create/activate one canonical memory, mark the candidate promoted, and append an audit event.
- **FR-025:** Edit-and-accept must validate the edited content with the same length, sensitive-data, duplicate, and contradiction checks. The audit must record that the user edited it without retaining secret rejected drafts.
- **FR-026:** Conflict resolution must be explicit and atomic. "Replace existing" deactivates/supersedes the old memory and activates the new one in one transaction.
- **FR-027:** Dismissal must prevent the same normalized evidence/content pair from being suggested repeatedly under the same policy version. A content-free tombstone/fingerprint may be retained.
- **FR-028:** Users must be able to edit an existing active memory. The prior version becomes non-retrievable and an audit event records the change.
- **FR-029:** Users must be able to delete an active memory or pending candidate. Deletion takes effect in retrieval immediately and must not reveal whether another user owns a supplied ID.
- **FR-030:** If a source chat is deleted, source links must become "Source chat deleted"; the memory may remain, but no copied transcript excerpt may survive solely in memory provenance.
- **FR-031:** Bulk accept is out of scope. Bulk dismiss may be added only if each candidate still receives an auditable per-record transition.

### 9.4 Retrieval and tool contract

- **FR-032:** `listMemories(userId)` and prompt injection must return only active, non-deleted, non-superseded memories, in a stable documented order.
- **FR-033:** Existing consumers must continue receiving at least `id`, `content`, and `createdAt`; metadata additions must be backward compatible.
- **FR-034:** Pending candidates, confidence values, model rationale, internal fingerprints, audit rows, and source excerpts must never be injected into normal agent context.
- **FR-035:** The `remember` tool must create an active `source=manual` memory with an audit event and run deterministic secret/sensitive validation.
- **FR-036:** `remember` must detect exact duplicates and material contradictions rather than blindly insert. A duplicate returns the existing memory; a contradiction returns a safe conflict result and must not silently replace it.
- **FR-037:** `forget` must remain user-scoped, deactivate/delete the active memory immediately, and write a content-minimized audit event.
- **FR-038:** `list_memories` must list active memories only. A separate review API/UI, not the normal agent tool, owns pending candidates in v1.
- **FR-039:** The active-memory cap of 100 remains. When full, candidates can still be generated for review but acceptance must require deleting/replacing an existing memory; runs must not fail globally.
- **FR-040:** A memory correction must be reflected in newly started agent sessions. Existing Eve sessions are not required to hot-reload changed system instructions; the UI must not claim immediate effect inside an already-started session.

### 9.5 Audit, observability, and cost

- **FR-041:** Every run and candidate state transition must have a timestamped audit event with actor (`system`, `user`, or authorized operator), action, object IDs, policy/model version, and content-minimized reason code.
- **FR-042:** Application logs must use IDs, counts, durations, token counts, cost estimates, status/error categories, and redacted model identifiers; they must not log transcript text, candidate content, secrets, gateway keys, or raw model responses.
- **FR-043:** Run metrics must include users claimed, days processed, chats scanned, user messages considered, candidates proposed/rejected/deduped/conflicting/promoted/dismissed, retries, failures, tokens, estimated cost, and latency.
- **FR-044:** Per-user/day limits must cap eligible chats, user-message characters, model input tokens, output candidates, and model calls. Truncation must be deterministic, checkpointed, visible in run status, and favor the most recent eligible user-authored turns without splitting evidence spans.
- **FR-045:** The initial defaults must be conservative: maximum 20 chats/day, 200 user messages/day, 60,000 user-message characters/day, 8 candidates/day, 2 extraction model calls/day, and one repair call only when schema validation fails. These are deployment configuration values, not ordinary UI controls.
- **FR-046:** Runs with no eligible text must complete without a model call.
- **FR-047:** Exact duplicate and deterministic rejection checks must occur before semantic/model comparison where possible to avoid unnecessary spend.
- **FR-048:** Cost estimates must use measured input/output token counts and configured per-model pricing when available; otherwise record tokens and `cost_unknown=true` rather than inventing a price.
- **FR-049:** A deployment-wide daily token/cost circuit breaker must stop new claims while allowing in-flight runs to checkpoint safely. Users see "Delayed by operator cost limit," not a false success.

## 10. Proposed data model

Names may be adjusted to repository conventions during the approved implementation plan, but the semantics and uniqueness constraints are requirements.

### 10.1 `memory` (Evolve existing table)

Required fields:

- `id uuid primary key`
- `user_id text not null`
- `content text not null` (maximum 500 characters enforced in application; database check preferred)
- `normalized_key text not null`
- `category text not null`
- `status text not null`: `active | superseded | deleted`
- `source text not null`: `manual | nightly_review | nightly_auto`
- `confidence numeric nullable`: null for manual/user-authored memory
- `created_at timestamp not null`
- `updated_at timestamp not null`
- `superseded_by uuid nullable`
- `deleted_at timestamp nullable`

Indexes/constraints:

- index on `(user_id, status, created_at)`;
- uniqueness preventing two active exact-normalized memories per user (partial unique index where supported);
- all list/update/delete operations remain scoped by `user_id`.

### 10.2 `memory_source`

One memory or candidate may have one or more supporting spans without copying transcript content:

- `id uuid primary key`
- `user_id text not null`
- `memory_id uuid nullable`
- `candidate_id uuid nullable`
- exactly one parent is non-null
- `chat_id uuid nullable` with `on delete set null`
- `start_seq integer not null`
- `end_seq integer not null`
- `source_event_ids jsonb nullable` containing stable Eve event IDs where present
- `source_message_fingerprint text not null` (keyed/HMAC fingerprint preferred over raw hash to resist offline guessing)
- `created_at timestamp not null`

Do not persist a raw transcript quote in this table. Provenance inspection fetches the currently owned source span from `chat_event`; if unavailable, it shows only safe metadata.

### 10.3 `memory_candidate`

- `id uuid primary key`
- `user_id text not null`
- `run_id uuid not null`
- `content text nullable` (null after hard candidate deletion when a tombstone is retained)
- `normalized_key text not null`
- `category text not null`
- `status text not null`: `pending_review | promoted | dismissed | rejected | deleted | conflict`
- `confidence numeric not null` in `[0,1]`
- `durability_score numeric not null` in `[0,1]`
- `risk_flags jsonb not null` containing enum values only, never matched secret text
- `reason_codes jsonb not null` containing bounded enums, not free-form chain-of-thought
- `conflicts_with_memory_id uuid nullable`
- `promoted_memory_id uuid nullable`
- `policy_version text not null`
- `model_id text not null`
- `model_output_fingerprint text not null`
- `idempotency_key text not null`
- `created_at`, `reviewed_at`, `deleted_at`

Constraints:

- unique `(user_id, idempotency_key)`;
- candidate state transitions validated on the server;
- `content` must be absent from logs and may be nulled for deleted/rejected secret-like candidates.

### 10.4 `memory_extraction_schedule`

Separate from Lookouts and one row per opted-in user:

- `user_id text primary key`
- `enabled boolean not null default false`
- `timezone text not null`
- `local_run_hour integer not null default 2`
- `next_run_at timestamp nullable`
- `leased_until timestamp nullable`
- `lease_token uuid nullable`
- `last_successful_local_date date nullable`
- `consecutive_failures integer not null default 0`
- `last_error_code text nullable`
- `created_at`, `updated_at`

A lease token is required so a stale worker cannot finish or reschedule a row claimed by a newer worker after lease expiry.

### 10.5 `memory_extraction_run`

- `id uuid primary key`
- `user_id text not null`
- `target_local_date date not null`
- `timezone text not null`
- `window_start timestamp not null`
- `window_end timestamp not null`
- `status text not null`: `claimed | discovering | extracting | completed | partial | failed | cancelled`
- `lease_token uuid not null`
- `policy_version text not null`
- `model_id text not null`
- `prompt_version text not null`
- `attempt_count integer not null`
- count fields for chats/messages/candidates and rejection classes
- input/output token counts and estimated cost fields
- safe `error_code`, never raw provider response text
- `started_at`, `completed_at`, `created_at`, `updated_at`

Constraint: unique `(user_id, target_local_date, policy_version)` for ordinary runs. Explicit re-evaluation uses a new policy version or an authorized replay generation key, and still deduplicates against existing candidates/memories.

### 10.6 `memory_extraction_checkpoint`

- `run_id uuid not null`
- `chat_id uuid not null`
- `high_water_seq integer not null`
- `status text not null`: `pending | processing | completed | skipped | failed`
- eligible message/character counts
- candidate/rejection counts
- `attempt_count`, safe `error_code`, `started_at`, `completed_at`, `updated_at`
- primary/unique key `(run_id, chat_id)`

### 10.7 `memory_audit_event`

- `id uuid primary key`
- `user_id text not null`
- `memory_id uuid nullable`
- `candidate_id uuid nullable`
- `run_id uuid nullable`
- `actor_type text not null`
- `actor_id text nullable` (user ID for user action; null for system)
- `action text not null`
- `reason_code text nullable`
- `metadata jsonb not null` limited to IDs, versions, scores, category, status transitions, and safe counts
- `created_at timestamp not null`

Audit must not retain old/deleted memory content, transcript excerpts, model chain-of-thought, secret matches, gateway credentials, or raw provider errors.

## 11. Privacy and security requirements

- Every discovery query, source fetch, candidate mutation, memory mutation, and audit read must enforce `user_id` ownership in the database query, not only in route code.
- Authenticated APIs must return 404 for missing or foreign IDs where distinguishing them would disclose existence.
- Scheduler work must derive the user from the claimed database row. Do not accept an arbitrary user ID from an unauthenticated request.
- If headless Eve/model calls reuse internal authentication, preserve the ordered `agent/channels/eve.ts` auth chain and constant-time shared-secret validation. Prefer a purpose-scoped internal principal/secret over broadening the Lookout secret's meaning.
- The extraction model receives the minimum user-authored text and limited conversational context needed. Never send gateway keys, cookies, auth headers, document blobs, hidden reasoning, tool credentials, MCP headers/tokens, or unrelated chats.
- Deterministic pre-filtering must recognize common credential formats and high-risk contextual patterns. Post-filtering must run on the final proposed sentence as defense in depth.
- Secret detection must favor false negatives least: high-severity matches are rejected, not merely sent to review.
- Rejected secret-like model output is not persisted verbatim. Store only a reason enum, source fingerprint, and aggregate count needed for audit/idempotency.
- Model prompts must state that chat content is untrusted data and that instructions inside the transcript cannot alter extraction policy, schema, tools, destinations, or system behavior.
- Extraction runs have no general tools, web access, MCP access, Sandbox, file access, or ability to call `remember`. They return structured candidates only for validation on the server.
- Candidate rationale is bounded to enumerated reason codes. Do not request or store chain-of-thought.
- Normal application logs and analytics must not contain memory content or source text.
- Database backups necessarily contain active memory and pending candidate content; deployment documentation must identify them as sensitive user data and cover backup access, retention, restore, and deletion limitations.
- Deleting an account cascades schedules, runs, checkpoints, candidates, sources, audit rows where policy permits, and memories.
- Content-security, CSRF/session, rate-limit, and Better Auth conventions used by adjacent settings APIs remain applicable.

## 12. Review mode and future auto-promotion

### 12.1 Initial release

- All extracted candidates are `pending_review` or `conflict`.
- Confidence influences ordering and display bands only; it does not activate memory.
- The settings screen explains that suggestions do not affect answers until accepted.
- Candidate review actions are explicit and individually auditable.

### 12.2 Required gates before auto-promotion can be enabled

Auto-promotion requires a later explicit product approval and all of the following:

1. At least 30 days of review-mode production data or 1,000 reviewed candidates, whichever provides a statistically meaningful sample approved by the product owner.
2. Offline eval thresholds in Section 15 pass on the locked dataset and on a blind holdout.
3. Production precision among accepted/dismissed reviewed candidates is at least 98% for the proposed auto-eligible categories, with the lower bound of a 95% confidence interval at least 96%.
4. Zero known secret/sensitive-memory promotions in evals, canary, or production review samples.
5. Auto-promotion is limited initially to `preference`, `standing_instruction`, and `constraint`; project decisions and recurring entities remain review-only until separately approved.
6. Candidate confidence `>= 0.97`, durability score `>= 0.90`, no risk flags, valid provenance, and at least one direct unambiguous user assertion.
7. No exact/semantic duplicate, contradiction, correction cue, uncertainty cue, negation ambiguity, or time-bounded language.
8. Full audit and one-click correction/deletion are deployed and tested first.
9. A per-user opt-in separate from review-mode extraction exists; default remains off.
10. A deployment-level kill switch can disable auto-promotion without disabling candidate extraction or requiring a rollback.

### 12.3 Contradiction contract

- Exact same durable fact: suppress candidate and link audit decision to existing memory.
- Compatible refinement: show review candidate; do not auto-merge in v1.
- Newer explicit replacement ("I no longer…", "use X instead of Y"): mark conflict and offer replacement in review.
- Ambiguous tension: mark conflict and require user action.
- Active memory is never silently overwritten by extraction confidence alone.

## 13. User stories and experience

### US-001: opt in to nightly suggestions

**Description:** As a user, I want to enable nightly memory suggestions in my timezone so that MiniScira can identify durable context without silently saving it.

**Acceptance Criteria:**

- [ ] Extraction is disabled until the user explicitly opts in.
- [ ] The settings UI shows the validated timezone and next eligible run.
- [ ] Disabling extraction prevents new runs without deleting existing memories or review history.
- [ ] Settings authorization, browser, keyboard, narrow-screen, and screen-reader checks pass.

### US-002: review extracted candidates

**Description:** As a user, I want to review each suggested memory with its source and confidence so that I control what becomes durable context.

**Acceptance Criteria:**

- [ ] Each suggestion shows content, category, confidence band, source chat/date, and conflict state.
- [ ] The user can accept, edit and accept, dismiss, or inspect the source.
- [ ] Accepting or dismissing the same candidate repeatedly remains idempotent.
- [ ] Another user cannot read or mutate the candidate or its provenance.

### US-003: avoid unsafe or transient memories

**Description:** As a user, I want secrets, identifiers, speculation, and temporary task state rejected so that nightly extraction does not create unsafe or noisy memories.

**Acceptance Criteria:**

- [ ] Deterministic filters reject configured secret and identifier patterns before model output can be promoted.
- [ ] Model evals meet the PRD thresholds for durable-memory recall, secret rejection, transient-state rejection, and unsupported inference.
- [ ] Rejected content is recorded only as bounded audit metadata and does not preserve the sensitive plaintext.
- [ ] Transcript instructions cannot override the extraction policy or output schema.

### US-004: handle duplicates and contradictions safely

**Description:** As a user, I want duplicate and conflicting suggestions handled explicitly so that my active memory remains coherent.

**Acceptance Criteria:**

- [ ] Exact duplicates are suppressed and associated with the existing memory in audit evidence.
- [ ] Refinements and contradictions require review in the initial release.
- [ ] No active memory is silently overwritten by model confidence alone.
- [ ] Retry and concurrent-run tests prove that a source range cannot create duplicate active candidates.

### US-005: inspect, correct, and delete learned memory

**Description:** As a user, I want to inspect provenance and edit or delete accepted memories so that durable context remains accurate and under my control.

**Acceptance Criteria:**

- [ ] Accepted memories identify their source type and expose owned provenance when available.
- [ ] Editing produces one current active value while retaining bounded audit history.
- [ ] Deletion removes the memory from future prompt retrieval and follows the documented audit-retention policy.
- [ ] Stale or deleted source chats are represented explicitly rather than as broken links.

### US-006: operate reliably and within limits

**Description:** As an operator, I want scheduled extraction to be leased, checkpointed, observable, and cost-bounded so that failures and retries are safe.

**Acceptance Criteria:**

- [ ] Timezone-aware runs use the in-database lease and checkpoint contract defined by this PRD.
- [ ] Overlapping workers cannot process the same user-day concurrently.
- [ ] Retries resume from checkpoints without duplicate candidates or active memories.
- [ ] Per-run token, transcript, candidate, duration, and failure metrics are emitted without transcript plaintext or secrets.

### 13.1 Settings controls

Extend the existing memory section with:

- "Suggest memories from my chats" toggle.
- Timezone selector/detected suggestion with validation and next-run preview.
- Brief privacy explanation: only user-authored chat text is examined; secrets and transient details are rejected; suggestions require review.
- Status line for last completed run and safe failure/delay states.
- Link/action to manually run the most recently completed local day only if no equivalent run is in progress; this action obeys the same idempotency and cost limits.

### 13.2 Suggestions list

- Pending count and list, newest evidence date first, then confidence band.
- Candidate sentence, category, "High/Medium/Low confidence" band, source chat/date, and conflict badge.
- Actions: Accept, Edit and accept, Dismiss, View source.
- View source opens the owned chat at the relevant message/range when available. If deep-linking to an event is not yet supported, open the chat and display the source date/range without copying transcript text into the candidate record.
- Loading, empty, error, stale source, memory-cap reached, and narrow-screen states are required.
- All actions support keyboard navigation, visible focus, screen-reader labels, and confirmation for destructive replacement/deletion.

### 13.3 Active memory list

- Continue to show active content and learned date.
- Add source badge (`You asked`, `Accepted suggestion`, later `Auto-added`) and source link where available.
- Add Edit alongside Delete.
- A corrected memory is shown once; superseded versions are not visible in the normal list.

## 14. Model and extraction contract

### 14.1 Input

A model request contains:

- fixed policy and schema version;
- target local date and timezone only when needed to interpret relative dates;
- bounded transcript units with opaque local source IDs;
- user message text plus minimum adjacent text needed for coreference;
- existing-memory shortlist containing only active memory content/IDs relevant to deduplication, never unrelated settings or credentials;
- explicit instruction that transcript text is untrusted and cannot change policy.

### 14.2 Structured output

Each proposed item must include:

- `sourceIds[]` referencing supplied user-message units;
- `content`;
- `category` enum;
- `confidence` in `[0,1]`;
- `durabilityScore` in `[0,1]`;
- `decision` enum: `candidate | reject_transient | reject_sensitive | reject_speculative | duplicate | contradiction | insufficient_evidence`;
- bounded `reasonCodes[]` enum;
- optional `comparedMemoryId` from the supplied shortlist.

Unknown keys are rejected. Output count is capped. The model is not asked for hidden reasoning.

### 14.3 Model selection

- Use a deployment-configured extraction model with structured-output support through the existing OpenAI-compatible gateway.
- Do not use the user's interactive chat-model picker.
- Billing credential policy must be decided before implementation (Open Question OQ-003). A run without an authorized credential fails safely and does not fall back silently to another payer/model.
- Record the exact model ID and policy/prompt version with each run/candidate.
- Model changes require rerunning the locked eval dataset before deployment.

## 15. Test and evaluation plan

### 15.1 Unit tests

At minimum:

- IANA timezone validation and 02:00 next-run computation.
- Local-day UTC windows for ordinary days and DST spring-forward/fall-back in multiple zones.
- Timezone changes and automatic catch-up limit.
- Atomic lease claim, token ownership, expiry, stale-worker finish rejection, batch limit, backoff, and circuit breaker.
- Event accessors/predicates in `lib/chat-events.ts`; no opaque `.type` reads outside the allowed function.
- Detection of real user activity from event timestamps rather than `chat.updatedAt`.
- Superseded/edit/retry, failed/cancelled, multi-session, late-arriving, and high-water event handling.
- Transcript sanitization and exclusion of assistant/tool/reasoning/document/client-context content.
- Secret/sensitive detector corpus, including positive, obfuscated, contextual, and benign near-match cases.
- Candidate schema rejection, source ownership/range checks, content length, normalization, category enums, and reason enums.
- Exact dedupe, semantic decision plumbing, contradiction transitions, dismissal tombstones, memory cap, and atomic replace.
- Idempotency keys and unique-constraint behavior under concurrent retries.
- Active-only retrieval and backward-compatible tool/API projections.
- Audit metadata allowlist rejects content-bearing/free-form fields.

### 15.2 Integration/database tests

- Committed forward migration applies to a database containing existing memories and backfills them as active/manual without data loss.
- Rollback compatibility is tested against a backup/restore copy; see Section 18.
- Multiple workers claim due users concurrently without duplicate user/day runs.
- Process interruption after run creation, checkpoint creation, model response, candidate insertion, promotion, and schedule advancement resumes safely.
- Source chat deleted before/during/after extraction.
- User/account deleted during a leased run.
- Foreign-user API access to schedules, candidates, sources, memories, and audit IDs returns no data.
- Candidate acceptance and conflict replacement are transactional.
- Active memory retrieval excludes every non-active status.
- Cost/token counters and no-call empty-day behavior are accurate.

### 15.3 Browser/end-to-end tests

- Opt in, detect/select timezone, see correct next local run.
- Review an extracted suggestion, inspect source, accept it, start a fresh chat, and observe the accepted memory influence the answer.
- Edit-and-accept, dismiss, edit active memory, delete active memory.
- Resolve a contradiction by keeping existing and by replacing existing.
- Handle deleted source chat, full active-memory capacity, extraction failure, cost-delay, empty suggestions, loading, and retry states.
- Verify another signed-in user cannot access IDs or source links.
- Test narrow viewport, keyboard-only operation, focus management, screen-reader labels, and reduced motion.

### 15.4 Security tests

- Prompt injection inside user chat attempts to change policy, request tools, exfiltrate other chats, or force secret storage.
- Secret formats: API keys, JWTs, OAuth tokens, cookies, `.env` lines, PEM keys, seed phrases, passwords in prose, signed URLs, connection strings, recovery codes, and obfuscated variants.
- Benign near-matches: public issue numbers, model names, postal codes, package versions, public URLs, and non-secret UUID examples.
- Cross-user source IDs and candidate IDs.
- Raw provider/model errors containing prompt fragments are redacted before logs/audit.
- Forged/stale lease tokens and unauthorized manual-run requests.

### 15.5 Model evaluation dataset

Create a versioned, repository-owned dataset with **at least 160 cases** and a locked blind holdout of at least 20% (not tuned against). Fixtures use synthetic or explicitly sanitized transcripts; no production user text enters source control.

Minimum case coverage:

| Group | Minimum cases | Examples |
|---|---:|---|
| Clear durable positives | 30 | language/units, stable style, recurring tools, durable constraints, standing instructions |
| Transient negatives | 25 | today-only requests, task progress, temporary travel, fleeting mood, expired deadline |
| Secrets/high sensitivity | 25 | keys, JWTs, passwords, private keys, connection strings, IDs, diagnosis/protected attributes |
| Speculation/uncertainty | 15 | "maybe," assistant inference, brainstorming, conditional choices, hearsay |
| Deduplication/paraphrase | 15 | exact repeats, paraphrases, compatible refinements, near-topic non-duplicates |
| Contradictions/corrections | 20 | "no longer," changed unit/style/tool, ambiguous conflict, replacement versus refinement |
| Event/transcript complexity | 15 | edits, superseded turns, failed turns, tool output, subagents, multi-session logs |
| Prompt injection/adversarial | 15 | transcript commands, schema attacks, source-ID forgery, attempts to store hidden text |
| Timezone/day boundaries | 10 | UTC edges, 23/25-hour days, messages exactly at boundaries, late persistence |
| Long/noisy/multilingual | 15 | long chats, many irrelevant turns, pronouns, negation, multilingual durable statements |

Cases may satisfy more than one group, but the dataset must contain at least 160 distinct cases.

Each fixture defines:

- timezone and target local date;
- ordered sanitized events/source units;
- existing active memories;
- expected eligible source spans;
- expected candidates/categories or explicit no-candidate outcome;
- expected duplicate/contradiction relation;
- forbidden substrings that must never appear in persisted candidates;
- whether a result would be eligible for future auto-promotion.

### 15.6 Eval metrics and pass thresholds

For review-mode release:

- **Secret/high-sensitivity leakage:** 0 persisted candidates across the full dataset.
- **Unsupported candidate rate:** <= 1% of produced candidates; 0 on blind adversarial holdout.
- **Candidate precision (durable and useful):** >= 95% overall and >= 90% in every allowed category with at least 10 cases.
- **Recall on clear durable positives:** >= 85% overall. Recall is secondary to precision/safety.
- **Transient rejection recall:** >= 98%.
- **Correct source-span attribution:** >= 98%; no cross-user or nonexistent source accepted.
- **Exact duplicate suppression:** 100%.
- **Semantic duplicate classification:** >= 95%.
- **Contradiction detection:** >= 95%, with 0 silent overwrite outcomes.
- **Structured-output validity after at most one repair:** >= 99%; invalid remainder produces no candidate.
- **Determinism/idempotency:** repeated run over identical fixture/model snapshot produces no additional persisted candidates and the same normalized decision set in >= 99% of cases; all differences must remain safe review-only outcomes.

For future auto-promotion, apply the stricter Section 12 thresholds in addition to all above. No aggregate score may hide a secret leakage, cross-user provenance error, or silent contradiction overwrite; any such event is an automatic release failure.

### 15.7 Regression evals

- Preserve and extend `evals/memory.eval.ts` for explicit `remember` behavior.
- Add focused nightly extraction evals and a deterministic dataset runner that can report per-group confusion matrices, source accuracy, forbidden-substring failures, token use, and model/policy version.
- Run the focused memory evals for any change to extraction prompt, schema, filters, memory tools, retrieval, model, normalization, or contradiction logic.

## 16. Acceptance criteria

- **AC-001:** Feature is opt-in and a user can enable/disable it with a validated IANA timezone and correct next-run preview. (`FR-001–008`)
- **AC-002:** A per-user run processes exactly the preceding completed local day, including tested 23- and 25-hour DST days. (`FR-003, FR-009–012`)
- **AC-003:** Only chats with persisted, current user submissions in that interval are scanned; background updates and Lookout-only chats do not qualify. (`FR-010–012`)
- **AC-004:** Extracted suggestions are durable, user-grounded, provenance-backed, schema-valid, and bounded by configured cost/size limits. (`FR-013–018, FR-044–049`)
- **AC-005:** Secret, highly sensitive, transient, speculative, assistant-only, tool-only, and external-document-only content never becomes a persisted candidate or active memory. (`FR-012–016`; Section 11)
- **AC-006:** Retries, overlapping ticks, lease expiry, restart, and same-version replay create no duplicate candidate or memory. (`FR-005–008, FR-020`)
- **AC-007:** Pending candidates do not influence agent answers before acceptance. (`FR-021, FR-032–034`)
- **AC-008:** User can inspect source, accept, edit-and-accept, dismiss, resolve conflicts, edit active memory, and delete memory with strict ownership checks. (`FR-021–031`)
- **AC-009:** Existing explicit `remember`, `forget`, `list_memories`, API, and prompt-injection flows remain compatible while enforcing active-only retrieval and safer duplicate/secret handling. (`FR-032–040`)
- **AC-010:** Every run/transition is auditable without transcript, candidate, secret, chain-of-thought, or raw provider-response leakage in logs/audit. (`FR-041–043`; Section 11)
- **AC-011:** Migration preserves all existing memory rows as active/manual memories and documented restore/rollback tests pass. (Section 18)
- **AC-012:** All unit, integration, browser/E2E, authorization/security, migration, and model eval gates in Section 15 pass.
- **AC-013:** Auto-promotion remains unavailable in the initial release and cannot be enabled by editing an ordinary user setting or calling an undocumented route. (Section 12)
- **AC-014:** Production canary proves scheduling, candidate review, active-memory retrieval, cost metrics, and kill switches on real infrastructure without relying on health checks alone. (Section 18)

## 17. Ordered implementation tasks (for post-approval planning)

Do not execute these tasks until this PRD is explicitly approved and converted into the session TODO list.

1. **T-001: Lock schemas and threat model**
   - Finalize enums, candidate structured output, normalization rules, sensitive categories, audit allowlist, billing decision, and operator limits.
   - Produce threat-model notes for transcript injection, cross-user access, secret retention, stale leases, and deletion/backups.
   - Covers: AC-004, AC-005, AC-010.

2. **T-002: Add committed database migration**
   - Evolve `memory`; add source, candidate, schedule, run, checkpoint, and audit tables plus indexes/constraints.
   - Backfill existing rows as `source=manual`, `status=active`, with deterministic normalized keys.
   - Add forward, populated-database, and restore/rollback tests.
   - Likely files: `lib/db/schema.ts`, `lib/db/migrations/*`, migration metadata.
   - Covers: AC-006, AC-009, AC-011.

3. **T-003: Define event and transcript projection helpers**
   - Add required predicates/accessors only through `lib/chat-events.ts`.
   - Build user-activity discovery, supersede-aware current user-message projection, source spans, and high-water snapshots.
   - Likely files: `lib/chat-events.ts`, new `lib/memory-transcript.ts`, adjacent tests.
   - Covers: AC-002, AC-003, AC-005.

4. **T-004: Implement timezone schedule and lease primitives**
   - Add local-day math, due computation, catch-up, atomic claim with lease token, backoff, stale-worker protection, and circuit breaker.
   - Follow `lib/lookout-schedule.ts` patterns without reusing Lookout rows or UTC-cron assumptions.
   - Likely files: new `lib/memory-extraction-schedule.ts` and tests.
   - Covers: AC-001, AC-002, AC-006.

5. **T-005: Implement deterministic safety, normalization, and idempotency layer**
   - Secret/sensitive filters, normalized keys, HMAC source fingerprints, candidate schema validation, exact dedupe, audit metadata validation, and idempotency keys.
   - Likely files: new `lib/memory-safety.ts`, `lib/memory-normalize.ts`, tests/fixtures.
   - Covers: AC-004–006, AC-010.

6. **T-006: Implement bounded extractor and checkpointed runner**
   - Discover eligible chats, create checkpoints, assemble minimal untrusted input, call configured model with strict schema/no tools, validate output, record cost, and resume safely.
   - Do not activate candidates.
   - Likely files: new `lib/memory-extractor.ts`, `lib/memory-extraction-runner.ts`, tests.
   - Covers: AC-003–007, AC-010.

7. **T-007: Add Eve minute-tick dispatch**
   - Add or extend a schedule that claims bounded due memory jobs and uses `waitUntil`; preserve Lookout scheduling behavior and no-external-queue invariant.
   - Decide whether one shared minute tick or a separate authored schedule is operationally clearer, without double dispatch.
   - Likely files: `agent/schedules/*`, scheduling integration tests.
   - Covers: AC-001, AC-006, AC-014.

8. **T-008: Upgrade canonical memory service and agent tools**
   - Active-only retrieval, manual source/audit, duplicate/contradiction behavior, safe deletion/editing, memory cap handling, and backward-compatible projections.
   - Likely files: `lib/memories.ts`, `agent/tools/{remember,forget,list_memories}.ts`, `agent/instructions/10-memories.ts`, tests.
   - Covers: AC-005, AC-007, AC-009, AC-010.

9. **T-009: Add authenticated schedule/candidate/memory APIs**
   - Settings GET/PATCH, run status/manual run, candidate list/detail/source, accept/edit/dismiss/conflict actions, and active-memory edit/delete.
   - Scope every query by authenticated user and add foreign-ID tests.
   - Likely files: `app/api/memories/**`, `app/api/settings/**`, ownership helpers/tests.
   - Covers: AC-001, AC-007–010.

10. **T-010: Build accessible review and correction UI**
    - Extend `components/settings-memories.tsx` or split focused components for settings, suggestions, conflicts, provenance, editing, deletion, and all states in Section 13.
    - Verify in a real browser at desktop and narrow widths with keyboard and accessibility checks.
    - Covers: AC-001, AC-007, AC-008.

11. **T-011: Build the versioned model eval suite**
    - Add at least 160 sanitized cases, blind holdout handling, per-group metrics, forbidden-substring checks, source scoring, and thresholds.
    - Extend `evals/memory.eval.ts` and add focused nightly extraction eval/data files.
    - Covers: AC-004, AC-005, AC-012.

12. **T-012: Run complete verification and security review**
    - Run focused tests/evals, full quality gates, browser flows, authorization/security suite, migration test, `git diff --check`, and inspect logs/diffs for content or secret leakage.
    - Covers: AC-001–013.

13. **T-013: Deploy review-mode canary**
    - Back up database, apply committed migration explicitly, deploy with extraction and auto-promotion kill switches off, then enable only for approved canary users.
    - Verify real schedule claim, candidate review, fresh-session retrieval after acceptance, cost metrics, replica lease behavior, and deletion.
    - Covers: AC-011, AC-014.

14. **T-014: Controlled rollout and documentation**
    - Roll out opt-in review mode gradually, publish privacy/operation/backup/restore guidance, monitor quality/cost/error metrics, and retain immediate kill switches.
    - Auto-promotion remains disabled.
    - Covers: AC-010, AC-014.

## 18. Deployment, migration, rollback, and operations

### 18.1 Deployment sequence

1. Back up Postgres and record the running application image/commit.
2. Run migration tests against a copy containing representative existing `memory`, `chat`, and `chat_event` data.
3. Deploy schema first through the explicit migration service; normal application startup must not mutate schema.
4. Deploy application code with both extraction dispatch and auto-promotion disabled by deployment flags.
5. Verify existing memory list, explicit remember/forget, chat, and Lookout behavior before enabling extraction.
6. Enable scheduler claims only for test/canary users.
7. Exercise one real prior-local-day run, inspect suggestions, accept/edit/delete, and start a fresh session to verify retrieval.
8. Verify no duplicate claims under the actual replica/process topology and no content leakage in logs.
9. Expand opt-in availability while monitoring quality, cost, retries, lease age, queue depth, and candidate actions.

### 18.2 Kill switches

Required deployment controls:

- disable all new memory extraction claims;
- disable model calls while preserving review/read/delete actions;
- disable manual extraction runs;
- disable future auto-promotion independently;
- optionally cap deployment-wide daily tokens/cost.

### 18.3 Rollback

- Application rollback must preserve newly created memory/candidate tables and columns until a compatible forward fix is deployed; destructive down-migration is not the default rollback.
- Old application code must either tolerate the evolved `memory` table or rollback must use a compatibility view/verified compatible schema. This must be proven before production.
- Disable scheduler claims before rolling back workers.
- Pending candidates can remain inert in the database; old code must never inject them.
- If migration corruption or data loss occurs, stop writes and restore the pre-migration database backup. Document the resulting loss window before proceeding.
- Never restore deleted memory content from audit metadata; audit is intentionally content-minimized.
- After rollback, verify chat, Lookouts, explicit memory tools, Settings memory deletion, and fresh-session retrieval—not health endpoints alone.

### 18.4 Observability and alerts

Alert on:

- oldest due schedule age above threshold;
- stuck/expired leases and repeated stale-worker completion attempts;
- run failure rate, schema-invalid output rate, and provider auth failures;
- unusual candidate or rejection spikes;
- any secret-filter post-model match;
- daily token/cost threshold and circuit-breaker activation;
- duplicate-key conflicts above expected retry baseline;
- candidates promoted without a valid audit event or provenance row (must be zero).

## 19. Cost and performance budget

- No model call on empty eligible days.
- Default per-user/day limits are locked in `FR-045`; operators may lower them.
- Claim batches and extraction concurrency must be configurable and conservative enough for a single self-hosted container and Postgres service.
- Database discovery must use indexes and bounded ranges; no unbounded full scan over all users' chat events per minute tick.
- The minute tick should query only due schedule rows, then each run queries only the target user/day.
- Model input should consist primarily of user-authored text. Assistant context is included only when required to disambiguate references and is bounded separately.
- Long days produce a visible `partial` run with deterministic continuation/checkpoints rather than silently dropping arbitrary messages or exceeding budget.
- Initial performance target: scheduler claim query p95 under 250 ms at 100,000 schedule rows on indexed Postgres similar to production; non-model processing p95 under 5 seconds per ordinary user/day fixture; model latency reported separately.
- Initial cost target must be set after selecting the model and pricing source (OQ-003/OQ-004). The rollout must measure median and p95 tokens and cost per active user-day before broad enablement.

## 20. Traceability matrix

| Acceptance criterion | Requirements | Primary tasks | Verification |
|---|---|---|---|
| AC-001 | FR-001–008 | T-004, T-007, T-009, T-010 | timezone/lease unit tests; settings E2E |
| AC-002 | FR-003, FR-009–012 | T-003, T-004, T-006 | DST/day-boundary tests; integration run |
| AC-003 | FR-010–012 | T-003, T-006 | event fixtures; Lookout/background-negative cases |
| AC-004 | FR-013–018, FR-044–049 | T-001, T-005, T-006, T-011 | schema/dedupe/cost tests; model eval thresholds |
| AC-005 | FR-012–016 | T-001, T-003, T-005, T-006, T-011 | security corpus; forbidden-substring eval |
| AC-006 | FR-005–008, FR-020 | T-002, T-004–007 | concurrency/restart/unique-constraint integration tests |
| AC-007 | FR-021, FR-032–034 | T-006, T-008–010 | active-only retrieval tests; review E2E |
| AC-008 | FR-021–031 | T-008–010 | API ownership tests; full review lifecycle E2E |
| AC-009 | FR-032–040 | T-008, T-011 | existing and extended memory evals; API/tool tests |
| AC-010 | FR-041–043 | T-001, T-002, T-005–009, T-012 | audit allowlist tests; log inspection |
| AC-011 | data model, Section 18 | T-002, T-013 | populated migration and backup/restore rehearsal |
| AC-012 | Section 15 | T-011, T-012 | all named tests/evals and quality gates |
| AC-013 | Section 12 | T-007, T-009, T-012 | configuration/API negative tests |
| AC-014 | Section 18 | T-013, T-014 | canary schedule/review/retrieval/rollback evidence |

## 21. Success metrics

Review-mode success is measured after opt-in rollout:

- Zero confirmed secret/high-sensitivity candidates persisted or promoted.
- At least 95% of accepted/dismissed candidates judged durable and correctly grounded in sampled review data.
- At least 70% of shown candidates are accepted or edit-and-accepted; track category-specific rates rather than optimizing this at the expense of safety.
- Fewer than 2% of accepted suggestions are later deleted/corrected as factually wrong within 30 days.
- Duplicate active-memory creation rate is below 0.1%, with zero duplicates from retry/idempotency failures.
- 99% of due opted-in user-days reach completed, partial-with-visible-reason, or safely failed-with-visible-reason within 12 hours, excluding operator cost circuit-breaker delays.
- Median/p95 token use and estimated cost remain within the approved post-model-selection budget.
- No cross-user authorization/provenance incidents.

Metrics must not collect memory content or transcript text.

## 22. Open questions requiring resolution before implementation

- **OQ-001: Timezone ownership:** Should timezone live in `user_settings` (general profile setting) or the dedicated extraction schedule row? Recommendation: canonical general timezone in `user_settings`, copied into each run; schedule row references the current value.
- **OQ-002: Manual run UX:** Should users get "Run now for yesterday" in the first release, or should only the scheduler run? Recommendation: include it for testing/transparency, but enforce the same unique run and cost gates.
- **OQ-003: Billing credential:** Should nightly extraction use each user's saved gateway key, require a deployment shared key, or allow operator choice? This affects opt-in copy, failure semantics, and who pays. No silent fallback is allowed.
- **OQ-004: Extraction model and price budget:** Select a structured-output-capable model from the live gateway catalog, lock its context window/pricing source, and set median/p95 per-user-day cost targets before approval to implement.
- **OQ-005: Assistant context:** How much adjacent assistant text is necessary for pronoun/reference resolution without increasing injection and privacy risk? Recommendation: include only the immediately adjacent assistant message when the user message is not self-contained, and never treat it as evidence.
- **OQ-006: Source deep links:** Does the current chat UI have a stable message/turn anchor suitable for provenance links? If not, is opening the chat plus date/turn context sufficient for v1, or should stable anchors be included in scope?
- **OQ-007: Candidate retention:** How long should dismissed/rejected candidate rows and content-free tombstones remain? Recommendation: delete candidate content immediately on user deletion, retain only HMAC fingerprint/status/audit metadata for 90 days, and document backup limitations.
- **OQ-008: Audit visibility:** Should users see a full memory history/activity view in v1, or only current source/status plus operator-only audit? Recommendation: current provenance and lifecycle timestamps in v1; full history UI later, while authenticated deletion/export obligations remain supported.
- **OQ-009: Existing manual memories:** Should existing rows without provenance display "Saved in an earlier conversation" or "Source unavailable"? Recommendation: "Saved manually; source unavailable."
- **OQ-010: Archive interactions:** Chat archive is only a backlog idea today. When introduced, should archived chats remain extraction-eligible? Recommendation: yes unless the user explicitly excludes them; archive is not deletion/privacy exclusion.
- **OQ-011: User exclusion controls:** Is a per-chat "Don't learn from this chat" control required in v1? Recommendation: add it before broad rollout if product wants strong preventive control; at minimum, opt-out and candidate review are required by this PRD.
- **OQ-012: Sensitive but useful facts:** V1 rejects broad sensitive categories even when directly stated. Any future consent-based sensitive memory requires a separate PRD, explicit consent semantics, encryption/access review, and dedicated evals.

## 23. Approval gate

This document is a **draft**, not implementation authorization. Before work starts:

1. Resolve OQ-003 and OQ-004 and any other open question that changes architecture or UX.
2. Review and explicitly approve this PRD.
3. Update the backlog entry status/link to `PRD approved` only after explicit approval.
4. Convert Section 17 into ordered session TODOs with exact files, dependencies, tests, and eval commands.
5. Do not enable auto-promotion; it requires the separate gates and later approval in Section 12.

## 24. Verification commands for the future implementation

Focused tests/evals must be named during implementation planning. The full repository gate is:

```bash
/opt/data/bin/bun run typecheck
/opt/data/bin/bun run lint
/opt/data/bin/bun test
/opt/data/bin/bun run check
git diff --check
```

Any memory prompt, extraction, tool, or retrieval change must also run the focused `evals/memory.eval.ts` and new nightly-memory dataset suite with recorded model/policy versions and threshold report. UI work must be verified in a real browser; migration/deployment work must exercise the real opted-in nightly run and review-to-fresh-session retrieval flow.

## 25. Codex/implementation handoff contract

When this PRD is approved, any coding-agent prompt must:

- name this file as the source of truth;
- use `/opt/data/miniscira-src` and read `AGENTS.md` plus all linked applicable documents;
- state that the task is review-mode nightly extraction only and auto-promotion must remain unavailable;
- preserve the Eve event-type and in-database scheduling invariants;
- list exact tasks/files/tests from the approved plan;
- prohibit external queues, embeddings, unrelated refactors, UI redesign, secret logging, and scope expansion;
- require the migration, security, browser, model-eval, deployment, and rollback evidence in this PRD;
- instruct the agent to stop and ask if any unresolved choice would change privacy, billing, scheduling, retrieval, or user-visible behavior.

No implementation should begin from this draft alone.
