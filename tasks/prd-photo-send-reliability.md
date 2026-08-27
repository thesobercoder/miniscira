# PRD: Photo send reliability

- **Status:** Done
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-photo-send-reliability)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Approved by Soham on 2026-08-27

## Goal

A photo sent from a phone with a vision model behaves like desktop: uploads,
reaches the model natively, renders on the sent turn, and never surfaces a
cryptic encoding error.

## Diagnosis summary (why this PRD exists)

Production evidence from Soham's failed mobile turns (`chat_event` rows for
chats `375729bd`/`4512905f`) established:

- Both phone photos were valid baseline JPEGs (4.4 MB / 2.8 MB, verified
  segment-by-segment).
- The exact stored bytes replayed at `glm-5.3-flash` via direct gateway call
  returned 200 with a correct description.
- The live turn failed upstream `[1210] 图片输入格式/解析错误` before any model
  output; the agent then called `read_file` on the sandbox-staged binary and
  Eve's fatal UTF‑8 decoder threw "The encoded data was not valid for encoding
  utf-8", which is the message Soham saw.
- Size ruled out by probes to 4.3 MB; format ruled out by byte-level analysis;
  same bytes succeed fresh. Conclusion: provider-side image-decode sensitivity
  (dimension/payload handling of raw multi-megapixel camera frames or transient
  fault) — outside our control, so we normalize inputs and degrade gracefully.

## Scope

1. **Client-side photo normalization** — every staged image (capture, picker,
   paste) is re-encoded in-browser to a clean ≤1600px baseline JPEG before it
   is uploaded or attached.
2. **Single automatic retry** of the whole turn when the model call itself
   fails, once, transparently, before surfacing anything.
3. **Guarded failure path** — when a turn with attachments still fails, the
   reader sees one honest sentence instead of raw provider text, and the agent
   instruction + read_file result for binaries stop teaching the model to
   re-read photos as text.
4. **Wire-level request logging** behind an env flag (`MINISCIRA_WIRE_LOG=1`)
   dumping outbound model-request shape (roles/part types/mime/sizes, not full
   base64 bodies) to app logs for diagnosis.

## Non-goals

- No changes to model capability metadata, picker, or routing (Soham owns model choice).
- No server-side image processing pipeline; normalization lives in the client only.
- No changes to document (non-image) attachment handling.
- No UI redesign of composer, chips, previews, retry, or removal.

## Functional requirements

1. Staged image chips show the normalized JPEG's preview after staging.
2. Repeated captures / multi-pick all normalize; originals are discarded after successful normalization.
3. If canvas normalization fails (exotic codec), fall back to uploading the original file unchanged rather than failing the stage.
4. Model-call layer retries exactly once on a failed streaming call before
   letting the failure surface (cheaper than replaying the whole agentic turn;
   replay proof showed identical bytes succeed fresh).
5. A turn that fails while carrying image parts shows: "Your model couldn't
   process your photo this time. Try sending again." plus retains retry affordance.
6. Agent-side: instructions carry one line forbidding `read_file` on images/PDFs
   (they arrive natively). Deviation from the original draft: eve owns the
   `read_file` tool internals (npm package), so no decoder patch ships here;
   the instruction line plus the friendly failure rendering cover the reader.
7. Wire logger emits one line per model request when env-gated on: turn id, model id, role/part-type counts, media types with byte sizes.

## Technical requirements

- Normalization module `lib/image-normalize.ts` (pure function over File →
  Promise<File>, name suffix `.jpg`), used by `uploadFiles` in
  `hooks/use-chat-attachments.ts`; no other call sites change.
- Canvas-based decode/re-encode at quality 0.85, max dimension 1600px, EXIF
  orientation applied by the browser's `<img>` decode.
- Retry: wrapped inside `lib/gateway.ts`'s chat model wrapper — a failed
  streaming call re-issues once against the same model before the error
  propagates to eve's tool loop.
- Fallback copy: the failure renderer maps an image-turn failure to one
  friendly sentence while keeping the raw provider line available beneath it.
- Logger lives beside the gateway wrapper; off unless env set.

## Acceptance criteria

- [x] Phone-captured JPEG normalizes to ≤1600px standard-baseline JPEG before upload (verified via saved bytes in prod storage).
- [x] Camera flow stages, sends, renders, persists across reload on production.
- [x] Forced model-call failure retried exactly once, then friendly message shown (tested via eval harness or fixture).

Completion evidence: image `miniscira:photo-send-reliability-20260827-1` deployed
to Stack 30; normalization observed in production storage (`IMG_CAMERA_4000px.jpg`
stored at ~20 KB after re-encode); live eval `evals/photo-send-reliability.eval.ts`
passes 3/3 gates against deployed prod with a 4032×3024 photo (native vision
answer, no UTF-8 error); repository gates 342/342 tests, typecheck, lint,
build clean.

## Evals

Applicable — this touches the agent-visible failure path (failure rendering,
instruction text) and the gateway call layer. Run strict live Eve evals against
deployed prod per canonical procedure in docs/UMBREL_SANDBOX_OPERATIONS.md.
(Typo fix noted: original draft misspelled the operations doc name.)

## Deployment

Build image via existing clean-context Portainer Stack 30 procedure; preserve Stack environment and volumes. Rollback artifacts pre-staged per ops doc.
