# PRD: formatted Lookout emails

- **Status:** Draft, awaiting approval.
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-formatted-lookout-emails)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)

## Summary

Lookout reports are generated as Markdown. `lib/lookout-runner.ts` extracts the final assistant text and passes it to `lib/email.ts`. The email code uses a small regular-expression converter and sends an HTML-only message through the existing Nodemailer and Fastmail path.

Replace the hand-built email HTML with a React Email template. Render the report as readable email content, add a plain-text alternative, and keep the message usable in light and dark email readers.

## Goals

- Make Lookout reports easy to scan in an email reader.
- Preserve useful report structure such as headings, paragraphs, lists, emphasis, and links.
- Render email-compatible HTML through React Email.
- Provide a complete plain-text MIME alternative.
- Keep text, links, controls, and backgrounds readable in light mode, supported dark mode, and clients that force color inversion.
- Prove the production path by delivering and inspecting a real Lookout email.

## User stories

- As a Lookout recipient, I can read the report without seeing raw Markdown syntax.
- As a recipient using a light email reader, I see clear text hierarchy, spacing, links, and an obvious action to open the report in MiniScira.
- As a recipient using a dark email reader, I can read every part of the message without low-contrast text, invisible links, or broken backgrounds.
- As a recipient who disables HTML email, I receive the full report and report link as plain text.
- As a MiniScira operator, I can keep the existing Fastmail SMTP configuration and sender identity.

## Product decisions

- Use React Email components and its render utility for the HTML email.
- Keep Nodemailer and the current Fastmail SMTP transport.
- Keep the recipient as the Lookout owner's signup email. Do not add a global recipient override.
- Keep the sender name `MiniScira` through the existing deployment-managed sender configuration.
- Send a multipart message with both `html` and `text` parts.
- Keep the full report in the email. The link to MiniScira is an additional action, not a replacement for the content.
- Use a simple, single-column layout with a maximum readable width. Do not reproduce the web application shell in email.
- Do not depend on an email client's dark-mode behavior being consistent. Supply explicit dark-mode hints and styles, then use colors that remain legible when a client ignores or overrides them.
- Treat Lookout Markdown as untrusted text. Raw HTML from the report must not become executable or active email markup.

## Scope

- A React Email template for successful Lookout reports.
- Safe conversion of report Markdown into email content.
- Subject, preheader, report title, report body, empty-report state, and the `Open in MiniScira` action.
- Light and dark email-reader styling.
- Plain-text rendering.
- Tests for rendering, content safety, SMTP payloads, and the existing recipient rules.
- Production delivery and inspection of a real Lookout email.

## Functional requirements

1. `sendLookoutEmail` renders a React Email component instead of concatenating an HTML string.
2. The email shows the Lookout name, a short MiniScira context line, the report, and a link to the persisted report chat.
3. The report renderer supports, at minimum:
   - paragraphs and line breaks;
   - headings;
   - ordered and unordered lists;
   - bold and italic text;
   - links with visible labels;
   - inline code and fenced code blocks;
   - block quotes;
   - horizontal rules.
4. Unsupported Markdown remains readable as text. It must not disappear or corrupt the rest of the message.
5. Raw HTML in the Markdown is escaped or removed. It must not create scripts, forms, embedded objects, style injection, event handlers, tracking images, or arbitrary email markup.
6. Links rendered from report Markdown allow only safe web URLs. Unsafe or malformed destinations remain non-clickable text.
7. Long URLs, long words, code, headings, and list items do not force horizontal scrolling in common mobile email readers.
8. An empty report shows `No notable updates this run.`
9. The `Open in MiniScira` link uses the existing production application origin and report chat ID.
10. The sent message contains equivalent `html` and `text` MIME parts. The plain-text part includes the full report and the MiniScira report URL.
11. Email rendering failure follows the current email-failure path. It must not send malformed fallback HTML, expose report contents in logs, erase the persisted report, or turn a successful research run into a failed run.
12. Missing SMTP configuration keeps the current no-send behavior.

## Design requirements

- Use semantic React Email components and email-safe inline styles for the base presentation.
- Use a neutral MiniScira layout with a clear heading, muted context text, readable report typography, restrained separators, and one primary action.
- Keep the report body at a comfortable reading width on desktop and fluid on narrow screens.
- Meet WCAG AA contrast for colors MiniScira controls.
- Include `color-scheme` and `supported-color-schemes` metadata for light and dark support where clients honor it.
- Include targeted `prefers-color-scheme: dark` styles for clients that support the query.
- Choose base foreground, background, border, link, and button colors that remain distinguishable under partial or full client color inversion.
- Do not communicate meaning through color alone.
- Do not rely on background images, remote fonts, animation, hover, or JavaScript.
- Decorative emoji or icons must not be required to understand the subject or content.

## Technical requirements

- Add the smallest supported React Email dependency set needed for components, HTML rendering, and plain-text rendering.
- Keep the template in a server-only module near the email delivery code. It must not enter the browser bundle.
- Keep SMTP credentials and transport construction in the existing server-side email boundary.
- Separate these responsibilities:
  1. parse and sanitize the report content;
  2. render the React Email template to HTML and plain text;
  3. submit the multipart message through Nodemailer.
- Do not reuse the browser-only Markdown component or application CSS. Email output must be self-contained.
- Do not add a hosted email-template service or restore Resend.
- Preserve the existing `sendLookoutEmail` caller contract unless a narrow typed change makes rendering safer.

## Security and privacy requirements

- Never include SMTP credentials, authorization data, internal headers, stack configuration, or server errors in the email body or logs.
- Escape user-controlled Lookout names and model-generated report content.
- Reject active and dangerous URL schemes.
- Do not add open tracking, click tracking, analytics pixels, remote report images, or new third-party requests.
- Keep recipient selection owner-scoped through `lookoutRecipient`.
- The report link must identify only the persisted chat. Existing application authentication and ownership checks remain responsible for access.

## Non-goals

- No change to Lookout creation, prompts, models, schedules, leases, retries, or report persistence.
- No change to who receives a Lookout email.
- No email editor, per-user email theme setting, custom template builder, or marketing layout.
- No attachments, embedded report images, open tracking, click tracking, unsubscribe workflow, or bulk-mail system.
- No change to the in-app report page.
- No migration from Fastmail or Nodemailer.

## Acceptance criteria

1. A report containing the supported Markdown structures arrives as structured HTML without visible Markdown markers.
2. The same message contains a complete and readable plain-text alternative.
3. Raw HTML and unsafe links in a report cannot become active email content.
4. The message remains readable in representative light and dark clients, including a client that honors custom dark styles and a client that applies forced color inversion.
5. The primary action remains visible and understandable in each tested mode even when button background styling is changed by the client.
6. The layout fits a narrow mobile reader without horizontal page scrolling.
7. Empty and long reports render without broken markup.
8. The existing Fastmail sender, owner signup-email recipient, subject purpose, report URL, and SMTP behavior remain intact.
9. A production Lookout run sends one real message to the approved test recipient, and the delivered message passes the content, link, light-mode, dark-mode, mobile-width, and plain-text checks.

## Test plan

### Unit tests

- Render representative Markdown fixtures and assert headings, paragraphs, lists, emphasis, links, code, quotes, and rules appear correctly.
- Test empty, very long, Unicode, long-link, and malformed Markdown inputs.
- Test escaping for raw HTML, event-handler text, dangerous URL schemes, and malformed links.
- Assert the generated HTML has the expected language, preheader, report title, safe report URL, color-scheme metadata, and dark-mode styles.
- Assert the plain-text output contains the full report and URL without HTML or essential missing content.

### Integration tests

- Mock Nodemailer and assert `sendLookoutEmail` submits `from`, `to`, `subject`, `html`, and `text` without exposing SMTP credentials.
- Keep tests for complete, partial, and absent SMTP configuration.
- Keep recipient tests proving delivery uses the owner's usable signup email and ignores a global override.
- Exercise the `runLookout` handoff from extracted assistant text to the email boundary without changing report persistence or scheduling.

### Email-client acceptance

Use one representative report fixture with headings, lists, emphasis, links, quotes, code, a long URL, and the MiniScira action. Inspect the delivered MIME message in:

- Fastmail web in light and dark appearance;
- one Apple Mail client in light and dark mode;
- one Gmail client with dark mode enabled;
- one Outlook client or a reliable Outlook rendering preview;
- a narrow mobile reader.

Record client and platform versions. Check content order, contrast, forced inversion, links, code wrapping, mobile width, and the plain-text part. A static browser preview alone does not satisfy this check.

### Authorization and security checks

- Open the report link signed out and as another account. Existing authorization must prevent report disclosure.
- Confirm crafted report Markdown cannot inject active HTML, remote content, or unsafe links.
- Confirm rendered or delivery errors do not log report bodies or secrets.

### Model evals

Model evals do not apply. This change does not alter prompts, tools, retrieval, memory, routing, or the report generated by the model. Deterministic rendering and real email-client checks cover the affected behavior.

## Production acceptance

After approval, implementation, tests, and deployment:

1. Use the current production Lookout procedure and deployment-managed SMTP configuration. Do not print credentials.
2. Trigger one approved test Lookout with a report that exercises the supported Markdown structures.
3. Confirm the Lookout run succeeds and the report remains available in MiniScira.
4. Confirm the intended signup-email inbox receives exactly one message from `MiniScira`.
5. Inspect the delivered HTML and plain-text alternatives and complete the email-client acceptance matrix.
6. Open the email action and confirm it reaches the correct authenticated report chat.
7. Verify scheduling and later Lookout delivery still operate normally.

Live Eve evals are not required because the agent output contract does not change. The real production Lookout run and delivered-message inspection are required and cannot be replaced by unit tests, generated HTML, SMTP acceptance, or a health check.

## Deployment

- Add the React Email runtime dependencies to the production image through the normal repository build.
- Deploy the application change without changing SMTP credentials or exposing an additional service.
- No database migration is expected.

## Observability

- Keep delivery errors concise and free of message bodies and credentials.
- Preserve enough failure context to distinguish rendering failure from SMTP delivery failure without recording private report content.
- Keep the current behavior in which email failure is logged separately from the completed research run. Do not add delivery state unless implementation evidence shows it is required.

## Rollback

- Revert the application change and redeploy the prior image.
- Do not change SMTP configuration or Lookout data during rollback.
- Confirm the prior Lookout delivery path works after rollback.

## Open questions

- Which exact Outlook environment or rendering service is available for acceptance testing?
- Should the first implementation support Markdown tables, or leave them as readable text until real Lookout reports show a need?

## Approval gate

This PRD is a draft. Do not install dependencies, implement the template, change delivery, send a test message, or deploy until Soham explicitly approves it.

## Implementation handoff

After approval:

1. Create TODOs that map every acceptance criterion to code, tests, email-client checks, production delivery, and rollback.
2. Add the smallest React Email dependency set.
3. Add safe report-content rendering and the React Email template.
4. Send HTML and plain-text alternatives through the existing Nodemailer path.
5. Run focused tests and all applicable repository quality gates.
6. Deploy through the canonical Umbrel procedure.
7. Deliver and inspect the real production email before marking the idea done.
8. Commit and push the verified source so local `HEAD` equals `origin/main` and the working tree is clean.
