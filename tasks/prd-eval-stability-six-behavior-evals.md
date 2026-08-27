# PRD: Six behavior evals pass consistently

- **Status:** To do
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-eval-stability-six-behavior-evals)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Not approved

## Goal

Six agent-behavior evals fail on the deployed production system. Passing once
is not enough: each of the six must pass on **every** run, so the result is
trustworthy with high confidence. This PRD records the diagnosis baseline and
plans the prompt strengthening and repeat-run evidence needed to reach that
bar. Soham deferred this work on 2026-08-27; it starts only after explicit
approval.

## Baseline evidence (2026-08-27)

Full strict production sweep (`python3 scripts/run-production-evals.py
--strict --max-concurrency 1`) against the deployed system
(`miniscira:photo-send-reliability-20260827-1`,
`DEFAULT_CHAT_MODEL=glm-5.3-flash`): 21 of 31 evals passed, 148 of 154 gates
passed. The six judged behavior failures:

| Eval | Gates | Failed gate | Expected vs observed |
|---|---|---|---|
| `ask-question` | 0/1 | `requireInputRequest` | Agent must park with an input request; it answered instead. |
| `memory` | 1/2 | `requireToolCall` | Exactly one `remember` call expected; zero observed. |
| `document-files-production-acceptance` | 29/30 | `loadedSkill(docx)` | A matching `load_skill("docx")` call expected; only `run_code` ×3 observed. |
| `document-generation-routing` | 31/32 | `succeeded` | Autonomous completion expected; the run parked on 1 unanswered input request. |
| `thread-search-date-range` | 4/5 | `satisfies(...)` | Plan text must name the topic and the exact half-open UTC day; it used loose date wording. |
| `thread-search-no-match` | 2/3 | `includes(...)` | Honest no-match answer must use the gated denial phrasing; its wording ("found nothing") did not match the regex. |

Read across the six: ask/park judgment is inverted in two places (`ask-question`
vs `document-generation-routing`), tool selection under-uses `remember` and
`load_skill`, and two thread-search answers miss the fixture's exact phrasing.

Four further evals (`compare-options`, `deep-research-fanout`,
`plan-progress`, `skill-routing`) fail with "stream closed before a turn
boundary" before gates can judge. Reproduced 4/4 on a dedicated re-run. That
is a long-turn streaming problem, not agent behavior, and is out of scope
here.

## User stories

- As Soham, I want every behavior eval to pass on every run, so a green suite
  means something.
- As the maintainer, I want each fix tied to a recorded diagnosis, so prompt
  changes are deliberate and reviewable.

## Scope

1. Diagnose each of the six failures as one of: agent instructions gap,
   fixture predicate too narrow, or model-behavior delta. Record the
   diagnosis here before changing anything.
2. Strengthen the system prompts in `agent/instructions/` where the diagnosis
   points there.
3. Adjust a fixture predicate only when the gate is genuinely too narrow, with
   a per-eval justification in this PRD.
4. Prove stability with a defined repeat-run evidence window (see Acceptance
   criteria).

## Non-goals

- The four stream-transport evals; they need their own plan.
- Changing models, providers, or the `EVAL_CHAT_MODEL` configuration
  contract.
- Feature work beyond what the six evals require.
- Changes to eve internals or `node_modules`.

## Functional requirements

1. Each of the six evals passes 10 consecutive individual production runs
   with zero failures.
2. A full strict sweep passes 27 of 31 evals (only the four out-of-scope
   stream evals may fail).
3. Fixtures stay model-agnostic: `EVAL_CHAT_MODEL` override keeps working and
   no model name is hard-coded.

## Technical requirements

- Prompt changes live in `agent/instructions/`; fixture changes in `evals/`.
- Every change runs the repository gates (typecheck, lint, tests, build)
  before production runs.
- Production evidence comes only from `scripts/run-production-evals.py`
  against the deployed system.

## Acceptance criteria

- [ ] Diagnosis recorded in this PRD for each of the six failures.
- [ ] A prompt or fixture fix applied for each, matching its diagnosis.
- [ ] Each of the six passes 10 consecutive individual production runs.
- [ ] One full strict production sweep passes 27 of 31 evals.
- [ ] `EVAL_CHAT_MODEL` override re-proven working end to end.
- [ ] Repository gates pass: typecheck, lint, tests, build.
- [ ] Changes committed and pushed; image deployed through the documented
      Stack 30 flow; deployed health verified.
- [ ] `python3 scripts/check-task-docs.py` passes.

## Deployment and rollback

Deploy the rebuilt image through the documented Stack 30 update flow. Rollback
is reverting the prompt/fixture commit and redeploying the previous image.

## Observability

While the stability window runs, record each production run (date, image tag,
per-eval result) in the evidence log below so pass-rate trends stay visible.

## Open questions

1. Is 10 consecutive passes the right confidence bar, or should the bar be a
   number of full-suite sweeps?
2. Should the four stream-transport evals get their own PRD now?
3. For `thread-search-no-match`, is the gated denial regex the product voice
   we want, or should the fixture accept a broader honest-denial phrasing set?

## Evidence log

- 2026-08-27: full strict sweep 21/31 evals, 148/154 gates on
  `miniscira:photo-send-reliability-20260827-1`; the six behavior failures
  listed above. Dedicated re-run of the four stream evals reproduced 4/4 in
  23m26s.
