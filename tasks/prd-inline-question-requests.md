# PRD: inline question requests

- **Status:** To do
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-inline-question-requests)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Not approved

## Problem

When the agent asks the user a question, MiniScira renders the question inside the collapsible research timeline. The question step also uses its own collapsible container and indented content frame.

The current code forces the outer research timeline open while a question is pending. The inner `QuestionNode` still inherits the closed default from `ChainOfThoughtStep`. This can hide the prompt and answer controls behind the **Question for you** row. The user sees that the agent stopped producing output but may not see that MiniScira is waiting for an answer.

A pending question is not background research. It is the next required action and must remain visible.

## Goal

Show a pending question as an inline action that the user can answer immediately. Do not require an expand action before the answer action.

## User stories

- As a user, I can see the full question as soon as the agent asks it.
- As a user, I can select an option or type an answer without opening another panel.
- As a user, I can tell that the agent is waiting for me rather than stopped.
- As a user, I can see the answer that MiniScira captured after I submit it.
- As a mobile user, I can read and answer the question without nested indentation reducing the available width.

## UX decision

### Pending state

Render the question inline and keep it open. Use this hierarchy:

1. A **Question for you** heading with the question icon.
2. The full question directly below the heading.
3. Answer options below the question when options exist.
4. A full-width freeform answer row when freeform input is allowed.

Do not render a disclosure chevron. Do not make the heading clickable. Do not wrap the prompt and controls in another indented question block. Keep the normal timeline alignment, but remove the extra content indentation that makes the action feel nested and reduces mobile width.

The visible prompt and controls are enough to communicate that the agent is waiting. Do not add a second status message such as "Waiting for your answer" unless browser testing shows that the action is still unclear.

### Answered state

After submission, remove the active options and input. Keep a compact record with:

1. The **Question for you** heading.
2. The original question.
3. A checked answer row that shows the exact captured option label or freeform text.

The answered record may follow normal completed-timeline behavior after the turn resumes. It must not lose the question or the captured answer.

### Other input request kinds

This PRD changes only `question` requests. Keep tool approvals and session-limit requests visually distinct. Review them separately before changing their disclosure or warning behavior.

## Functional requirements

1. A pending `question` request shows its prompt and answer controls without any user expansion.
2. The pending question has no collapse or expand control.
3. Option buttons remain available when Eve supplies options.
4. The freeform field remains available when Eve allows freeform input or supplies no options.
5. Submitting an option or freeform answer calls the existing response path exactly once.
6. While the response is being submitted, all question controls are disabled.
7. After the response is captured, MiniScira replaces the controls with the captured answer.
8. The original question remains visible in the answered record.
9. Reloading a chat with a recorded `inputResponse` shows the captured answer without relying on local component state.
10. The layout works at narrow mobile widths without horizontal scrolling or avoidable nested indentation.
11. Keyboard users can reach every option, the freeform field, and the submit button in a clear order.
12. The freeform form submits with Enter and retains an accessible **Send answer** name.

## Technical direction

- Keep Eve's `inputRequest` and `inputResponse` metadata as the source of truth.
- Keep the existing `onAnswer(requestId, response)` boundary.
- Add a question-specific non-collapsible presentation in `components/timeline/nodes/interaction.tsx` instead of weakening `ChainOfThoughtStep` for every timeline node.
- Preserve the outer `ResearchTimeline` rule that keeps a pending question visible.
- Do not add a second question state store. Local optimistic state may prevent duplicate interaction while the response event arrives, but the persisted `inputResponse` must win after reload.
- Reuse the existing button, input, color, and motion tokens.

## Test plan

### Component tests

Add focused tests for `QuestionNode`:

- A pending question renders the prompt, options, and freeform field immediately.
- A pending question has no disclosure trigger or collapsed state.
- Selecting an option sends its `optionId` once and disables the controls while busy.
- Submitting freeform text trims the text and sends it once.
- An answered question renders the original prompt and captured option label.
- An answered freeform question renders the captured text.
- A recorded `inputResponse` renders correctly without local `chosen` state.
- Tool approval and session-limit rendering do not regress.

### Browser acceptance

Verify on desktop and a narrow mobile viewport:

1. Start a chat that produces a real pending question.
2. Confirm that the prompt and controls are visible without any click.
3. Confirm that no question disclosure chevron appears.
4. Answer with an option and confirm that the agent resumes.
5. Repeat with a freeform answer.
6. Reload the answered chat and confirm that the question and captured answer remain visible.
7. Confirm that long prompts, long option labels, and long freeform answers wrap without horizontal scrolling.
8. Confirm keyboard focus order and Enter submission.

### Live Eve eval

Extend or pair with `evals/ask-question.eval.ts`:

- The agent parks with a non-empty input request.
- The user response resumes the turn to completion.
- The resumed turn performs the expected work.

The model eval proves the question and resume behavior. Browser acceptance proves the visible, non-collapsible interaction. Neither substitutes for the other.

## Acceptance criteria

- [ ] A pending question is fully visible without expanding the research timeline or the question row.
- [ ] The question row has no collapse or expand affordance while pending.
- [ ] The prompt and answer controls use the available timeline width without the current nested question-card indentation.
- [ ] Options and freeform answers use the existing Eve response path.
- [ ] The controls disable while the response is being submitted.
- [ ] The answered state shows the original question and exact captured answer.
- [ ] Reloading the chat restores the answered state from Eve metadata.
- [ ] Tool approvals and session-limit requests retain their current behavior.
- [ ] Component tests pass for pending, submitting, answered, reloaded, option, and freeform states.
- [ ] The existing question-and-resume Eve eval passes.
- [ ] Desktop and narrow mobile browser acceptance passes on the deployed MiniScira system.
- [ ] Typecheck, lint, the full test suite, repository checks, and production build pass.

## Non-goals

- Changing when the agent decides to ask a question.
- Changing Eve's input-request protocol.
- Adding a modal, toast, browser notification, or separate inbox for questions.
- Redesigning authorization, tool-approval, or session-limit requests.
- Keeping pending questions collapsible as a user preference.

## Deployment and observability

- Deploy through the normal MiniScira production path.
- Confirm the production app is healthy after deployment.
- Use the dedicated eval account and `python3 scripts/run-production-evals.py` for the applicable live eval.
- Verify the real question flow in the production browser, including the reload state.
- Check browser console and app logs for response or rendering errors.

## Rollback

Revert the question-specific presentation change. The existing Eve request and response data remain compatible because this feature does not change the protocol or stored event shape.

## Open questions

None. The pending question should never be collapsible.
