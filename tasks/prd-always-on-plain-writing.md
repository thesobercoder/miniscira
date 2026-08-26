# PRD: always-on plain writing

- **Status:** To do
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-always-on-plain-writing)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Not approved

## Problem

MiniScira already has a short writing standard in `agent/instructions/00-core.md`. It blocks several common AI writing habits, but it covers only part of the useful guidance in the public Unslop skill.

A mandatory writing standard should not depend on the model deciding to load a skill. An always-on skill would add a tool call, timeline noise, context use, and a failure mode on every turn.

## Goal

Expand MiniScira's existing core writing rules using the useful parts of Unslop. Apply the rules directly on every answer without adding an `unslop` skill or runtime tool call.

The change must preserve accuracy, citations, user preferences, task-specific skills, exact output formats, and the user's requested tone.

## Source

Use the public skill as design input:

`https://github.com/cursor/plugins/blob/main/pstack/skills/unslop/SKILL.md`

Do not copy it verbatim. Adapt the useful rules into MiniScira's shorter core writing standard. Record source or license attribution only if the final text requires it after implementation review.

## Product behavior

1. The core instructions give every root-agent answer the same plain-writing baseline.
2. The model applies the writing standard while composing its final answer. No skill load or second model pass is required.
3. Task-specific skills still control research method, output structure, citations, and domain requirements.
4. User tone and standing instructions still control voice unless they conflict with accuracy or safety.
5. The model writes direct, specific prose and removes common AI writing habits before sending the answer.
6. Hidden reasoning and tool work remain unaffected.

## Core instruction decision

Replace the current short Style subsection with a fuller but still compact standard. It should cover these rules:

- Be concise. Cut filler, hype, puffery, generic conclusions, chatbot openings, and repeated summaries.
- Use plain words, active voice, concrete claims, and short sentences when a sentence becomes hard to parse.
- Prefer `is`, `has`, and direct verbs over inflated substitutes.
- Name sources. Do not rely on vague attributions such as "experts say" or "industry reports."
- Do not force ideas into groups of three, cycle synonyms, create false ranges, or use stock "not only X, but Y" contrasts.
- Keep headings in sentence case. Use bold text only when it helps scanning. Do not add decorative emoji.
- Avoid repeated em dashes, colons, parentheses, and other punctuation habits that make prose feel generated. Use punctuation normally when grammar, code, quotations, citations, or the user's requested style needs it.
- Vary sentence length naturally. Do not add opinions, deliberate mistakes, fake informality, or personality that the user did not request.
- Say what something does. Replace vague claims about how it "feels" with a mechanism, example, source, or number.
- Stop when the answer is complete.

The final section should remain small enough to belong in the system prompt. Do not reproduce the full upstream checklist or its examples.

## Precedence

The core writing standard is a default editing rule. It must not override:

1. Accuracy and safety requirements.
2. The user's explicit language, tone, length, or format request.
3. User settings and standing instructions.
4. Required citations and task-specific skill instructions.
5. Exact code, commands, paths, API names, numbers, dates, URLs, quotations, legal text, or structured data.

## Functional requirements

1. `agent/instructions/00-core.md` contains the revised writing standard.
2. MiniScira does not add `agent/skills/unslop.md`.
3. The model does not call `load_skill` for `unslop`.
4. The standard applies to ordinary final answers, researched answers, scheduled reports, and resumed turns because it is part of the core instructions.
5. The standard does not remove inline citations or move them into a source list.
6. The standard does not change numbers, dates, names, URLs, code, commands, paths, or quoted text.
7. The standard respects the user's chosen tone and standing instructions.
8. The standard respects explicit output formats such as JSON, tables, code-only responses, short answers, or requested headings.
9. Scheduled Lookout reports retain their current HTML-only delivery contract.
10. The system prompt grows only by the compact adopted rules, with no duplicated checklist elsewhere.

## Test plan

### Static and unit checks

- Confirm that `00-core.md` contains the intended writing rules once.
- Confirm that no `unslop` skill file or mandatory `load_skill` instruction exists.
- Add a focused instruction test if the repository has a direct instruction-manifest test path. Otherwise document why model evals provide the useful coverage.

### Model evals

Add an eval set with deterministic checks and a small rubric. Use prompts that tend to produce the habits the standard targets.

Cases:

1. **Short explanation.** Ask for a plain explanation of a technical topic. Reject stock chatbot openings, inflated significance, filler, and a trailing generic conclusion.
2. **Cited research answer.** Ask a current factual question. Require normal search and read behavior, inline citations, and no trailing Sources section.
3. **Recommendation.** Ask the model to choose between two options. Require a clear recommendation with specific reasons, not a neutral list padded to three points.
4. **User tone override.** Supply a supported tone or standing instruction. Verify that the answer follows it while retaining the plain-writing baseline.
5. **Exact-format preservation.** Ask for a table, JSON object, or code-only response. Verify that the model adds no introduction, conclusion, or extra prose.
6. **Quoted and technical text preservation.** Give exact names, code, paths, numbers, and a quotation. Verify that the answer does not rewrite them.
7. **Punctuation exception.** Request prose or code where parentheses, colons, or dashes are correct. Verify that the standard prevents overuse rather than banning valid punctuation.

Pass requirements:

- No case calls `load_skill` for `unslop`.
- All existing task-specific skill and tool gates still pass.
- No case loses required citations or required output structure.
- The style rubric passes every case. Test observable habits, not a subjective claim that the answer has "soul."

### Regression evals

Run the existing skill-routing, fact-check, comparison, news, deep-research, question-and-resume, document-research, and Lookout-related evals that apply. The expanded core writing rules must not replace or suppress task-specific skill loads.

### Production acceptance

Use `python3 scripts/run-production-evals.py` against the deployed MiniScira system.

Verify at least:

1. A short answer returns concise, direct prose with no extra skill load.
2. A researched answer loads its task-specific skill, keeps inline citations, and has no trailing source list.
3. A structured-format request returns only the requested format.
4. A user tone setting remains visible in the final answer.
5. A Lookout report still renders and sends through the existing HTML-only path when that flow is affected by the core-instruction change.

Inspect the production timeline to confirm that there is no `unslop` skill call and no loading loop.

## Acceptance criteria

- [ ] MiniScira's core instructions adopt the useful Unslop writing rules in a compact form.
- [ ] MiniScira does not add or load an `unslop` skill.
- [ ] The final core section does not duplicate the full upstream checklist.
- [ ] Accuracy, inline citations, exact values, code, quotations, requested formats, and user tone survive the writing rules.
- [ ] Existing task-specific skills still load and control their tasks.
- [ ] The new style eval cases pass.
- [ ] Applicable existing agent evals pass.
- [ ] Production Eve evals pass against the deployed system.
- [ ] The production timeline shows normal task work with no `unslop` skill load.
- [ ] Typecheck, lint, the full test suite, repository checks, and production build pass.

## Non-goals

- Creating or installing an `unslop` skill.
- Adding a second post-processing model call.
- Adding a client-side prose rewriter.
- Replacing user tone settings.
- Rewriting retrieved source text or direct quotations.
- Banning punctuation characters in code, data, citations, or requested prose.
- Scoring or storing a user's writing style.
- Applying a separate editing pass to hidden reasoning or every subagent message.

## Deployment and observability

- Deploy through the normal MiniScira production path.
- Check app and Eve health after deployment.
- Run the applicable live Eve evals through the dedicated production eval account.
- Inspect production timelines for unexpected skill calls or missing task-specific skills.
- Check Eve and app logs for prompt or context-limit errors.

## Rollback

Restore the previous Style subsection in `agent/instructions/00-core.md` and redeploy the previous image. No database or stored-event migration is required.

## Open questions

None. The core instructions should own the always-on writing standard.

## Approval gate

Implementation starts only after Soham explicitly approves this revised PRD. After approval, create TODOs mapped to the acceptance criteria and eval cases above.

> **Review request:** Approve this revised PRD or request another change.
