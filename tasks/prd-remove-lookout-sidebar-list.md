# PRD: Remove the Lookout report list from the sidebar

Status: Approved on 2026-08-25

## Goal

Keep the sidebar focused on primary navigation and active research history.

## User stories

- As a user, I can still open Lookouts from the main sidebar navigation.
- As a user, I manage Lookouts and open their reports from the Lookouts page.
- As a user, long Lookout report lists no longer consume sidebar space.

## Scope

- Keep the main `Lookouts` navigation item and `/lookouts` page.
- Remove the expanded Lookout and report hierarchy from the sidebar.
- Stop loading Lookouts and their report history when rendering the sidebar.
- Remove sidebar-only Lookout list code and tests.
- Show only the five newest Lookouts on `/lookouts`.

## Non-goals

- No changes to Lookout creation, editing, scheduling, execution, email delivery, or reports.
- No database or migration changes.
- No pagination or archive UI for older Lookouts.
- No replacement sidebar control.

## Functional requirements

1. The sidebar contains one `Lookouts` navigation item.
2. The sidebar does not show individual Lookouts or report links.
3. `/lookouts` shows the five newest Lookouts and their reports.
4. Other sidebar navigation and research history remain unchanged.

## Technical requirements

- Remove the sidebar's Lookout database query and per-Lookout report queries.
- Remove `LookoutList` and its sidebar-specific test.
- Limit the existing Lookouts query to five rows after newest-first ordering.
- Preserve the existing Lookout scheduler and database behavior.
- Do not add new state, routes, or abstractions.

## Acceptance criteria

- Desktop and narrow-screen sidebars show the `Lookouts` navigation item once.
- No expanded Lookout section appears in the sidebar.
- Selecting `Lookouts` opens `/lookouts`.
- The Lookouts page displays at most the five newest Lookouts and their report history.
- A user with more than five Lookouts does not see older Lookouts on the page.
- Sidebar chat history and thread search still work.
- Focused tests, the full test suite, typecheck, lint, build, and `git diff --check` pass.
- Production browser verification covers the sidebar and Lookouts page.

## Evals

Model evals do not apply. This change does not affect agent behavior, prompts, tools, retrieval, memory, or model routing.

## Deployment

Build and deploy the MiniScira app through the existing Portainer Stack 30 procedure. Preserve Stack environment and durable volumes.

## Observability

Use browser verification and existing application health checks. No new logs or metrics are needed.

## Rollback

Restore the previous app image and Stack Compose backup. No database or storage rollback is required.

## Open questions

None. The main `Lookouts` navigation item remains the feature entry point. A future need for more than five Lookouts requires a separate product decision.