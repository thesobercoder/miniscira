# PRD: sandbox document files

- **Status:** In progress
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-document-generation)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Approved by Soham on 2026-08-24
- **Scope:** PDF, DOCX, PPTX, and XLSX creation and editing

## Problem

The agent can already write document files in its Sandbox. The current `run_code` result only publishes generated images, so an office document created successfully can remain trapped in the Sandbox. MiniScira also does not accept every supported office format as an input for editing.

MiniScira does not need a separate document platform. The agent needs four original MiniScira document skills, the tools those skills expect in the Sandbox image, and a small extension to the existing file path so supported documents can be uploaded and downloaded.

## Goal

A user can ask the agent to create or edit a PDF, DOCX, PPTX, or XLSX file. The agent loads the matching skill, uses the existing Sandbox, and returns the finished file as a download in the chat.

## Product behavior

1. The agent loads the matching PDF, DOCX, PPTX, or XLSX skill when the user asks for that format.
2. The skill tells the agent which installed tools to use and how to inspect the result.
3. The agent creates or edits the file with `run_code` in the existing isolated Sandbox.
4. `run_code` collects supported output files in addition to images and stores them through the existing durable local-blob path.
5. The timeline shows each returned file by name with a download action.
6. DOCX, PPTX, and XLSX downloads use the correct MIME type and download disposition. PDF can open in the browser or download.
7. Supported office files can be uploaded and staged into the Sandbox when the user asks the agent to edit them.
8. The file link remains usable after the chat reloads because it is part of the persisted tool result and the bytes live in `/data/uploads`.

## Required changes

### Skills

Make four clean-room MiniScira document skills available to Eve as load-on-demand skills:

- PDF
- DOCX
- PPTX
- XLSX

Write these skills from MiniScira's requirements and the public APIs of the installed libraries. Do not copy Anthropic skill text, scripts, references, or assets. Keep the skills small and use `run_code` directly.

### Sandbox image

Install and pin `reportlab`, `pypdf`, `python-docx`, `python-pptx`, and `openpyxl` in the image. The image must contain everything needed at runtime. The agent must not install packages during a chat.

Keep the current Sandbox isolation and network policy unchanged.

### Existing `run_code` path

Extend `run_code` rather than adding a new document-generation tool.

- Detect newly created `.pdf`, `.docx`, `.pptx`, and `.xlsx` files.
- Read their bytes from the Sandbox.
- Store them with the existing local-blob implementation.
- Return bounded file metadata: name, URL, MIME type, and size.
- Keep the current image behavior unchanged.
- Ignore unsupported outputs and enforce the existing execution and upload limits.

### File serving and uploads

- Serve the four formats with their standard MIME types.
- Send office files as attachments with a safe filename.
- Add the four formats to the accepted upload types.
- Classify them as documents and stage the original bytes for `run_code`.
- Do not send office files directly to the model as remote URL attachments. The Sandbox tools handle them.

### Chat UI

Extend the existing `run_code` timeline node with a small file-download list. Do not add an artifact library, preview system, detail panel, template picker, or document state machine.

## Acceptance criteria

- [x] The four clean-room MiniScira skills are discoverable and load on demand.
- [x] The production Sandbox contains the tools required by each skill.
- [ ] The agent creates one valid PDF, DOCX, PPTX, and XLSX fixture through the real chat flow.
- [x] Each file appears in the originating `run_code` result and downloads with the correct filename and MIME type.
- [ ] Each download still works after reloading the chat and recreating the app container.
- [ ] A user can upload a DOCX, PPTX, or XLSX file, ask for a small edit, and download the edited result.
- [x] Existing image generation and image rendering still work.
- [x] Unsupported Sandbox files are not published.
- [x] Output filenames cannot escape storage or inject response headers.
- [x] Sandbox isolation, egress restrictions, and cleanup checks still pass.
- [ ] Focused tests, the full test suite, lint, typecheck, repository checks, build, and real browser verification pass.

## Completion evidence

- Implementation: `aa765ff` (`feat: add sandbox document files`).
- Production routing eval: `python3 scripts/run-production-evals.py document-generation-routing` passed 32/32 gates on 2026-08-26.
- Partial production file acceptance: `python3 scripts/run-production-evals.py document-files-production-acceptance` passed 30/30 gates on 2026-08-26. It created and downloaded PDF, DOCX, PPTX, and XLSX outputs through deployed Eve, verified their MIME types and non-empty bytes, then uploaded and downloaded a returned DOCX. The eval does not yet inspect each document with a format-aware reader or prove that the requested edit changed the DOCX contents.
- Partial durability evidence: all five saved file URLs returned HTTP 200 with the expected MIME types and non-empty bytes after restarting the production app container. Chat reload and persisted timeline-link behavior still need browser verification.
- Regression checks: the focused document, file-route, attachment, timeline, and chat tests passed 26/26. The current full suite passed 333/333, and the production build completed successfully.
- Deployment and security: the production image includes the pinned document libraries. Existing Docker Sandbox isolation, egress, cleanup, image output, header safety, and unsupported-file behavior remained covered by the delivery validation and focused regressions.

### Remaining completion work

The feature implementation exists and the main production paths work. The remaining items are stronger completion checks, not known missing product behavior.

| Pending item | Kind | How to resolve it | Completion evidence |
|---|---|---|---|
| Prove that generated PDF, DOCX, PPTX, and XLSX files are valid and contain the requested fixture content. | Automated production Eve eval | Strengthen `document-files-production-acceptance` to download each file, open it with a format-aware reader, and assert its expected text, slide, sheet, or cell content. | A production eval run passes every structural and content assertion for all four formats. |
| Prove that an uploaded office document is edited rather than returned unchanged. | Automated production Eve eval | Use a deterministic DOCX fixture. Inspect the returned DOCX and assert that the replacement text exists and the original text is absent. | The production edit eval passes both semantic assertions. |
| Prove that generated links survive the user-visible persistence path. | Production browser acceptance | Create files in a signed-in chat, reload the chat, find the persisted `run_code` result, and download the files again. Recreate the app container and repeat the reload and download check. | A recorded browser run shows the persisted timeline links working after both reload and container recreation. |
| Prove the complete upload, edit, and download experience in the deployed UI. | Production browser acceptance | Upload one supported office file, request a small edit, wait for the timeline result, download it, and inspect the edited content. | A recorded browser run and inspected output confirm the deployed flow. |
| Close the repository quality gates against the final acceptance-eval changes. | Automated repository checks | Run focused tests, the full test suite, lint, typecheck, repository checks, build, and `git diff --check` after the stronger eval lands. | Every command passes on the final committed revision. |

Soham's manual test is useful product confirmation. It supports the conclusion that the feature works, but the PRD remains `In progress` until the reproducible content, persistence, and browser evidence above is recorded.

## Non-goals

- A new generated-artifact database table or API family.
- A dedicated `generate_document` tool or repository-owned document DSL.
- Built-in templates or a template registry.
- Browser previews, thumbnails, or Office rendering in MiniScira.
- A cross-chat artifact library.
- Collaborative editing or an Office-style editor.
- Formal document certification, exhaustive OOXML inspection, or a second validation framework beyond the skills' normal checks.
- Runtime package installation or arbitrary changes to Sandbox networking.

## Test and eval plan

### Automated tests

- MIME mapping and safe content disposition for all four formats.
- `run_code` publishes only newly created supported files.
- Returned metadata contains the correct name, URL, MIME type, and size.
- Existing image results remain unchanged.
- Office uploads are accepted, owner-scoped, and staged by filename.
- Unsupported extensions are ignored.
- Path traversal and header-injection filenames remain safe.
- The timeline renders working document download links.

### Agent evals

Use one direct request per format. Verify that the agent loads the matching skill, uses `run_code`, creates the requested file, checks it with the tools named by the skill, and returns the download. Add one edit request for an uploaded office document.

### Production acceptance

Create and download one small file per format through the real browser. Open each file with an appropriate reader. Reload the chat and download it again. Edit one uploaded office file. Confirm existing image output, service health, Sandbox isolation, logs, and container restarts.

## Implementation order after approval

1. Add the four clean-room skills and their required Sandbox packages.
2. Add office upload and MIME support.
3. Extend `run_code` to publish supported document outputs.
4. Add document links to the existing execution timeline.
5. Run the automated tests and agent evals.
6. Exercise all four create flows and one edit flow in the real browser.
7. Back up, deploy, and verify production.

## Approval gate

Implementation begins only after Soham explicitly approves this revised PRD. After approval, create a short TODO mapped to the seven steps above. If a skill requires a tool that cannot run in the current Sandbox image, resolve that package gap without adding a new product architecture.

> **Review request:** Approve this revised PRD or request another reduction.
