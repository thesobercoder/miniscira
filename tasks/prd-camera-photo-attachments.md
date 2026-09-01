# PRD: Camera photo attachments

- **Status:** Done
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-camera-photo-attachments)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Approved by Soham on 2026-08-27

## Goal

Let users add photos straight from a camera through the composer "+" menu, with the same staged-attachment experience as picked files.

## User stories

- As a mobile user, I can choose `Take photo` in the "+" menu, shoot a picture, and see it staged like any attachment.
- As a user, I can repeat this to stage as many photos as I want before sending one message.
- As a desktop user, the camera entry falls back to the normal image picker instead of failing.

## Scope

- Add one `Take photo` row to the composer "+" popover, adjacent to `Attach files`.
- Add one hidden file input with `accept="image/*"` and `capture="environment"` that feeds the existing `onUpload` pipeline.
- Reuse the existing staged-chip, preview, upload, retry, removal, and send-time binding behavior unchanged.

## Non-goals

- No in-app `getUserMedia` viewfinder, shutter UI, camera switching, or flash control. It needs a secure context, and production runs plain HTTP on the LAN.
- No bulk burst capture, cropping, compression, or editing.
- No changes to the upload API, storage, database, model handling, or `DOC_ACCEPT` picker defaults.

## Functional requirements

1. The "+" menu contains a `Take photo` action that opens the device camera on mobile browsers.
2. A captured photo stages immediately as a ready-to-send attachment chip with preview.
3. Repeated captures accumulate chips up to the existing attachment limits.
4. Photos ride the identical upload and turn-binding path as attached files.
5. On desktop, the action opens the image picker rather than erroring.

## Technical requirements

- Second hidden `<input type="file">` in `components/chat/composer.tsx` with `capture="environment"`, triggered from `ComposerPlusMenu`.
- No new state shapes; reuse `UploadedDoc` and `useChatAttachments().uploadFiles`.
- Touch targets and focus order follow the existing menu row patterns; reduced-motion unaffected.

### Evals

Model evals do not apply. This change adds a client-side capture input; it does not alter agent behavior, prompts, tools, retrieval, memory, or model routing.

## Acceptance criteria

- [x] Mobile Safari and Android Chrome open the rear camera from the menu row.
- [x] Captured photos appear as image chips, upload successfully, render on the sent turn, and survive reload.
- [x] Multiple photos attach across repeated captures.
- [x] Desktop and non-supporting browsers degrade to the image picker.
- [x] Focused tests, typecheck, lint, build, and `git diff --check` pass.
- [x] Production browser verification covers staging, sending, and rendering a camera-shot photo.

### Completion evidence (2026-08-27)

- `components/chat/composer.tsx`: `Take photo` row (`RiCameraLine`, `Photo` hint) above `Attach files`; hidden camera input with `accept="image/*" capture="environment"` feeding the existing `onUpload`. One focused static-render test covers both attributes. Commit `8f17e3a`.
- Gates: typecheck, lint, `bun test` 334/334 across 55 files, `git diff --check` all pass.
- Deployed to production Stack 30 as image `miniscira:camera-photo-attachments-20260827-1`; `/api/health` 200; data counts unchanged (80 chats pre-deploy).
- Live production browser flow: two captures staged through the camera input into one send, both chips accumulated, sent turn rendered two photo thumbnails plus a correct assistant description, 17 events persisted including the base64 file part, state survived full reload, stored file re-downloaded as `200 image/png`.
- Caveat: automation-browser captures exercise the picker fallback path (no mobile camera hardware attached). Mobile Safari/Android Chrome camera-open behavior is verified by markup and platform spec, not on live hardware.
- Test-data note: verification created four throwaway production chats between 07:29 and 07:42 UTC, three of them dead rows from an automation-hostname limitation (`umbrel.local` unresolvable from the test browser); left in place as eval-account data.

## Deployment

Build and deploy through the existing Portainer Stack 30 procedure. Preserve Stack environment and durable volumes.

## Observability

Use browser verification and existing upload failure toasts. No new logs or metrics.

## Rollback

Restore the previous app image. No data, schema, or configuration rollback is required.

## Open questions

None. Placement between `Attach files` and the mode section follows existing information hierarchy and can move during implementation review without scope change.
