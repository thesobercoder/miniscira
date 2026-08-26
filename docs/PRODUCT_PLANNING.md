# Product planning and execution

Read this document before you add a backlog idea, write a PRD, create implementation tasks, or implement a planned feature.

## Lifecycle

Follow these steps in this exact order:

```text
raw backlog idea
→ PRD
→ explicit user approval
→ TODO tasks
→ execution
→ verified feature completion
```

Use only these lifecycle statuses:

| Status | Meaning |
|---|---|
| `To do` | Work has not started. This includes raw ideas, draft PRDs, and approved PRDs that have not entered execution. |
| `In progress` | Implementation or required completion verification has started and is not finished. |
| `Done` | Implementation and every required completion check are finished. |

Approval is a gate, not a lifecycle status. Record approval in the PRD. An approved item stays `To do` until implementation or completion verification starts.

## 1. Product ideas

- Record raw product ideas in `docs/PRODUCT_IDEAS.md`.
- An idea may be brief or incomplete. It may include open questions.
- A product-ideas row records an idea. It does not allow implementation to start.
- Keep one table row for each idea through its full lifecycle, including after completion.
- Use the table columns `Idea`, `Status`, `Planning document`, and `Summary`.
- Use only `To do`, `In progress`, or `Done` in the Status column.
- Link the planning document when one exists. Use `Not drafted` for a raw idea without a PRD.
- When a draft PRD contains the full scope, shorten the table summary. Do not copy PRD requirements into the table.

## 2. PRD

- Follow the mandatory simplified technical English standard in `docs/DEVELOPMENT_PRINCIPLES.md`.
- When an idea is selected, create `tasks/prd-<feature-name>.md`.
- Link the backlog entry to the PRD.
- Start every PRD under `tasks/` with this metadata block:

  ```markdown
  # <document title>

  - **Status:** <current lifecycle status>
  - **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-<feature-slug>)
  - **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
  - **Approval:** <Not approved, or approved by the user with the date>
  ```

- Point related PRDs, implementation plans, and implementation records to the same product-idea row. Do not create a second index of files.
- Run `python3 scripts/check-task-docs.py` after you add, rename, or change task metadata. The check enforces the metadata block, product-idea backlinks, PRD coverage, and relative links.
- Define the goals, user stories, scope, non-goals, functional requirements, technical requirements, acceptance criteria, deployment, observability, rollback, and open questions.
- List every required check. Include unit, integration, browser/end-to-end, authorization/security, migration/rollback, deployment, and production acceptance checks.
- For changes to agent behavior, prompts, tools, retrieval, memory, or model routing, define eval cases, fixtures or datasets, expected outcomes, and pass thresholds.
- If model evals do not apply, explain why.
- A written PRD is not approved unless the user says so. Ask the user to review it.
- Record approval only after the user explicitly approves the PRD.
- After explicit approval, record the approval in the PRD. Keep the lifecycle status `To do` until implementation or required completion verification starts.

## 3. TODO tasks

- After PRD approval, turn the implementation work into the agent's TODO list.
- TODO items are the specific units of work that the agent performs and tracks.
- Put TODOs in order. Make each item atomic and small enough to implement and verify without unrelated changes.
- Record dependencies and affected areas or files when known.
- Map every PRD acceptance criterion to one or more TODOs and to exact tests or evals.
- Keep only one TODO `in_progress` at a time.
- Mark a TODO `completed` as soon as its implementation and required checks pass.
- If a task fails or its approach is no longer valid, mark it `cancelled` and add a corrected replacement.
- TODO state is temporary execution state. Do not copy it into durable memory. Do not change the PRD to track daily progress.

## 4. Execution and completion

- Do not implement a raw backlog idea.
- Do not implement an unapproved PRD.
- Start only after explicit PRD approval and after you create the TODO, test, and eval plan.
- Mark a feature `Done` only when:
  - every required TODO is complete;
  - every mapped acceptance test and eval passes;
  - you exercise the real user-visible flow;
  - you verify the production deployment when it applies; and
  - the repository meets the production source-control rules.
- Keep the approved PRD as the durable record of intent and acceptance.
- Mark completed features as `Done` in `docs/PRODUCT_IDEAS.md`. Keep the row and its PRD link so past work remains readable. Document shipped behavior in the relevant product or operations document.
- Keep completion evidence in commits, test results, eval results, and relevant operations documents.
