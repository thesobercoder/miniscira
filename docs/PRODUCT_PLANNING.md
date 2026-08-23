# Product planning and execution

Read this document before you add a backlog idea, write a PRD, create implementation tasks, or implement a planned feature.

## Lifecycle

Follow this order exactly:

```text
raw backlog idea
→ PRD
→ explicit user approval
→ TODO tasks
→ execution
→ verified feature completion
```

## 1. Backlog

- Record raw product ideas in `docs/PRODUCT_IDEAS.md`.
- An idea can be brief, incomplete, and contain open questions.
- A backlog entry preserves an idea. It does not authorize implementation.
- Track its status with one of these values when useful: `Backlog`, `PRD in progress`, `PRD approved`, `In progress`, or `Done`.

## 2. PRD

- When an idea is selected, create `tasks/prd-<feature-name>.md`.
- Link the backlog entry to the PRD.
- Define goals, user stories, scope, non-goals, functional and technical requirements, acceptance criteria, deployment, observability, rollback, and open questions.
- Determine all required unit, integration, browser/end-to-end, authorization/security, migration/rollback, deployment, and production acceptance checks.
- For changes to agent behavior, prompts, tools, retrieval, memory, or model routing, define eval cases, fixtures or datasets, expected outcomes, and pass thresholds.
- If model evals do not apply, explain why.
- A written PRD is not approved by implication. Ask the user to review it.
- Record approval only after the user explicitly approves it.
- After explicit approval, mark the PRD planning work done and set the backlog status to `PRD approved`. This does not mean the feature is implemented.

## 3. TODO tasks

- After PRD approval, derive the implementation work into the agent's TODO list.
- TODO items are the concrete units that the agent works on and tracks.
- Make TODOs ordered, atomic, and small enough to implement and verify without unrelated changes.
- Record dependencies and affected areas or files when known.
- Map every PRD acceptance criterion to one or more TODOs and exact tests or evals.
- Keep only one TODO `in_progress` at a time.
- Mark a TODO `completed` immediately after its implementation and required verification pass.
- If a task fails or its approach becomes invalid, mark it `cancelled` and add a corrected replacement.
- TODO state is temporary execution state. Do not copy it into durable memory or rewrite the PRD to track day-to-day progress.

## 4. Execution and completion

- Do not implement directly from a raw backlog idea.
- Do not implement from an unapproved PRD.
- Start only after explicit PRD approval and creation of the TODO, test, and eval plan.
- Set the backlog status to `In progress` when implementation starts.
- Mark a feature `Done` only after:
  - every required TODO is complete;
  - every mapped acceptance test and eval passes;
  - the real user-visible flow is exercised;
  - production deployment is verified when applicable; and
  - the repository satisfies the production source-control rules.
- Keep the approved PRD as the durable record of intent and acceptance.
- Keep completion evidence in commits, test results, eval results, and relevant operations documents.
