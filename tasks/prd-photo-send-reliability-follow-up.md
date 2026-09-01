# PRD: Photo send reliability follow-up

- **Status:** In progress
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-photo-send-reliability-follow-up)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Approved by Soham on 2026-08-28

## Goal

Close the failure-handling and proof gaps found in the shipped camera and photo
send path without replacing its small browser-upload design.

## User stories

## Scope

1. Keep staged attachments recoverable until Eve accepts the turn.
2. Preserve multi-image picker order and independent upload errors.
3. Detect and canonicalize accepted image bytes before durable storage.
4. Retry only model-call errors the AI SDK marks retryable.
5. Emit the approved redacted wire-request shape when explicitly enabled.
6. Add deterministic browser-API tests and real browser acceptance.

## Non-goals

- No custom camera subsystem or server-side image processing pipeline.
- No arbitrary normalization concurrency limit without measured mobile evidence.
- No rejection of a valid mobile image solely because its browser MIME type or
  filename is stale.
- No broad comment-cleanup refactor. Remove only comments made false by the
  behavioral changes.
- No Eve turn identifier invented at the model boundary. Use a local request ID.

## Functional requirements

## Technical requirements

### TODO

- [ ] Defer attachment removal and sent-turn rendering until Eve accepts the
  turn. Keep the question and attachment staged after chat creation, binding,
  attachment read, or pre-acceptance transport failure.
- [x] Preserve multi-image picker order and report each upload failure without
  blocking unrelated files.
- [ ] Detect JPEG, PNG, GIF, WebP, BMP, TIFF, AVIF, and HEIF-family headers.
  Store the detected MIME type and reject unrecognized claimed-image bytes.
- [ ] Retry once only when the AI SDK marks an API call error retryable.
- [ ] Log one safe line before each outbound model attempt with a local request
  ID, model ID, attempt, role and part counts, media types, and derivable byte
  sizes.

### Test plan

- Deterministic normalization tests cover dimensions, JPEG type, quality,
  bitmap cleanup, both canvas paths, encoding failure, decode fallback, and the
  small-JPEG fast path.
- Attachment lifecycle tests cover selection, deferred commit, and every
  pre-acceptance failure boundary. Retry tests cover local-file retention and
  object URL cleanup.
- Upload tests cover every accepted signature family, valid mislabeled images,
  malformed claimed images, and unchanged non-image behavior.
- Gateway tests cover retryable and permanent errors plus the strict wire-log
  allowlist.
- Multi-image tests prove stable picker order and isolated failures.

### Eval and acceptance plan

- Run focused tests, all repository tests, typecheck, lint, build, task-document
  checks, and `git diff --check`.
- Run a real browser flow through the camera file input. Prove normalization,
  upload, binding, native model delivery, forced pre-acceptance failure,
  attachment retry, and reload persistence.
- Deploy through the Stack 30 procedure with the current environment and
  external volumes preserved. Capture the previous Compose and immutable image
  IDs before the update.
- Run `python3 scripts/run-production-evals.py` against the deployed system.
  Report browser-path proof separately from the Eve model-delivery eval.

### Evals

Applicable because this changes attachment delivery and the model-call boundary.
Run strict live Eve evals through the canonical production runner. The direct
photo eval proves model delivery only; browser acceptance proves the camera and
upload path.

## Acceptance criteria

- [ ] A failed pre-acceptance send leaves the original question and photo ready
  to send again without another file selection.
- [ ] An accepted turn renders the correct photos and keeps them on the same
  user turn after a full reload.
- [ ] Recognized accepted image headers are stored under their detected MIME
  type even when browser metadata is stale. Unrecognized claimed-image bytes
  never enter storage.
- [ ] Permanent model errors are attempted once. Retryable model errors are
  attempted at most twice.
- [ ] Wire logs contain only local request IDs, model IDs, attempts, counts,
  media types, and byte sizes. They contain no prompt text, filenames, file
  bodies, base64 data, URLs, headers, error messages, credentials, or secrets.
- [ ] Focused checks, full gates, browser acceptance, deployed health, and all
  applicable strict production Eve evals pass.
- [ ] Production runs the pushed commit, the intended working tree is clean,
  and local `HEAD` equals `origin/main`.

## Deployment

### Deployment and rollback

Build and deploy through the Stack 30 procedure. Preserve the Stack environment,
external volumes, previous Compose, and previous immutable app image. There is
no schema migration or stored-byte rewrite, so code and image rollback is
sufficient.

## Observability

## Rollback

## Open questions
