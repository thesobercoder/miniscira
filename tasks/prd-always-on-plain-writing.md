# PRD: always-on plain writing

- **Status:** To do
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-always-on-plain-writing)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Not approved

## Problem

MiniScira already has a short set of writing rules in `agent/instructions/00-core.md`. They block several common AI writing habits, but they cover only part of the Unslop skill and rely on the model applying the rules without a final writing pass.

The full Unslop skill gives the model a better checklist for plain, human writing. It should guide every final answer without turning the system prompt into a copy of the skill or forcing one voice on every user.

## Goal

Install an adapted Unslop skill in MiniScira and give the model a short instruction to apply it before every final answer.

The change must preserve accuracy, citations, user preferences, task-specific skills, and the user's requested tone.

## Source

Adapt the public skill at:

`https://github.com/cursor/plugins/blob/main/pstack/skills/unslop/SKILL.md`

Record the source and license information required by the upstream repository. Do not depend on the remote URL at runtime.

## Product behavior

1. MiniScira exposes an `unslop` skill through the existing Eve `load_skill` path.
2. The core instructions tell the model to load and apply `unslop` before writing a final answer.
3. The instruction is short. The detailed checklist stays in the skill file.
4. Task-specific skills still control research method, output structure, citations, and domain requirements.
5. User tone and standing instructions still control voice unless they conflict with accuracy or safety.
6. The model writes direct, specific prose and removes common AI writing habits before sending the answer.

## Prompt decision

Add one small instruction near the existing Skills or Style section:

> Before writing the final answer, load and apply `unslop`. Treat it as an editing pass. Preserve facts, citations, requested structure, and the user's preferred tone.

The exact wording may change during implementation, but it must stay this narrow. Do not copy the full skill into `00-core.md`. Do not say that Unslop outranks user instructions, accuracy, citations, or another skill's required format.

## Skill adaptation

Create `agent/skills/unslop.md` using MiniScira's existing skill format.

Keep the source skill's useful writing checks, including:

- Cut puffery, vague attribution, filler, and generic conclusions.
- Prefer plain words, active voice, and concrete claims.
- Avoid forced groups of three, repeated synonyms, fake contrasts, and stock chatbot phrases.
- Use sentence-case headings and restrained bold text.
- Vary sentence length when it helps the answer read naturally.
- Preserve the user's language, requested tone, technical terms, citations, code, quoted text, and exact names.

Adapt rules that are too absolute for general assistant answers:

- Treat punctuation guidance as a check against overuse, not a ban that damages code, quotations, grammar, or the user's requested style.
- Do not add personal opinions unless the user asks for judgment or the task calls for a recommendation.
- Do not add deliberate mistakes or false informality to "add soul."
- Do not rewrite source quotations, code, commands, file paths, API names, legal text, or citation link text merely to match the style.

## Functional requirements

1. `load_skill` can load `unslop` in production.
2. The root agent loads `unslop` before every ordinary final answer.
3. The model applies it after research and tool work, not instead of that work.
4. The final edit does not remove inline citations or move them into a source list.
5. The final edit does not change numbers, dates, names, URLs, code, or quoted text.
6. The final edit respects the user's chosen tone and standing instructions.
7. The final edit respects explicit output formats such as JSON, tables, code-only responses, short answers, or requested headings.
8. Subagent working notes do not need an Unslop load unless they produce user-facing final prose.
9. Scheduled Lookout reports use the same root-agent writing behavior without changing their HTML email delivery contract.
10. The extra skill load does not cause repeated loading loops or more than one `unslop` load in a turn.

## Test plan

### Static and unit checks

- Confirm that `agent/skills/unslop.md` exists and uses the repository's skill format.
- Confirm that the core instruction names `unslop` once and does not duplicate its checklist.
- Add a focused instruction test if the repository has a direct instruction-manifest test path. Otherwise document why model evals provide the useful coverage.

### Model evals

Add an eval set with deterministic checks and a small rubric. Use prompts that tend to produce the habits the skill targets.

Cases:

1. **Short explanation.** Ask for a plain explanation of a technical topic. Require an `unslop` skill load. Reject stock chatbot openings, inflated significance, and a trailing generic conclusion.
2. **Cited research answer.** Ask a current factual question. Require normal search and read behavior, inline citations, no trailing Sources section, and an `unslop` load.
3. **Recommendation.** Ask the model to choose between two options. Require a clear opinion with specific reasons, not a neutral list padded to three points.
4. **User tone override.** Supply a supported tone or standing instruction. Verify that the answer follows it while retaining the plain-writing pass.
5. **Exact-format preservation.** Ask for a table, JSON object, or code-only response. Verify that the skill does not add an introduction, conclusion, or extra prose.
6. **Quoted and technical text preservation.** Give exact names, code, or a quotation. Verify that the answer does not rewrite those values.

Pass requirements:

- Every case loads `unslop` exactly once before the final answer.
- All existing task-specific skill and tool gates still pass.
- No case loses required citations or required output structure.
- The style rubric passes every case. The rubric should test observable habits, not subjective claims that the answer has "soul."

### Regression evals

Run the existing skill-routing, fact-check, comparison, news, deep-research, question-and-resume, document-research, and Lookout-related evals that apply. The always-on skill must not replace or suppress their task-specific skill loads.

### Production acceptance

Use `python3 scripts/run-production-evals.py` against the deployed MiniScira system.

Verify at least:

1. A short answer loads `unslop` and returns concise plain prose.
2. A researched answer loads both the task-specific skill and `unslop`, keeps inline citations, and has no trailing source list.
3. A structured-format request returns only the requested format.
4. A user tone setting remains visible in the final answer.
5. A Lookout report still renders and sends through the existing HTML-only path when that flow is affected by the root-agent change.

Inspect the production timeline to confirm that the skill load occurs once and does not loop.

## Acceptance criteria

- [ ] MiniScira has a repository-owned `unslop` skill adapted from the linked source.
- [ ] The repository records the source and required license attribution.
- [ ] The core prompt contains one short instruction to load and apply `unslop` before final answers.
- [ ] The core prompt does not duplicate the skill checklist.
- [ ] Accuracy, inline citations, exact values, code, quotations, requested formats, and user tone survive the editing pass.
- [ ] The agent loads `unslop` exactly once in each applicable eval turn.
- [ ] Existing task-specific skills still load and control their tasks.
- [ ] The new style eval cases pass.
- [ ] Applicable existing agent evals pass.
- [ ] Production Eve evals pass against the deployed system.
- [ ] The real production timeline shows one `unslop` load and a completed answer.
- [ ] Typecheck, lint, the full test suite, repository checks, and production build pass.

## Non-goals

- Replacing user tone settings.
- Rewriting retrieved source text or direct quotations.
- Banning punctuation characters in code, data, citations, or requested prose.
- Adding a second post-processing model call.
- Adding a client-side prose rewriter.
- Scoring or storing a user's writing style.
- Applying the skill to hidden reasoning or every subagent message.

## Deployment and observability

- Deploy through the normal MiniScira production path.
- Check app and Eve health after deployment.
- Run the applicable live Eve evals through the dedicated production eval account.
- Inspect production timelines for missing, duplicate, or repeated skill loads.
- Check Eve and app logs for prompt, skill-loading, or context-limit errors.

## Rollback

Remove the core loading instruction and the `unslop` skill file, then redeploy the previous image. No database or stored-event migration is required.

## Open questions

None. The implementation should use a short prompt nudge and keep the full guidance in the skill.

## Approval gate

Implementation starts only after Soham explicitly approves this PRD. After approval, create TODOs mapped to the acceptance criteria and eval cases above.

> **Review request:** Approve this PRD or request a change.
