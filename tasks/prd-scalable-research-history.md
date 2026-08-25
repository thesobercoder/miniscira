# PRD: paged research history

- **Status:** Approved by Soham on 2026-08-24. Implementation complete. Large-history production acceptance pending.
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-scalable-research-history)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)

## Problem

MiniScira loaded every research thread into the sidebar at once. The initial query, server render, client state, and rendered list grew with the user's full history.

## Goal

Load the 30 newest research threads first. Load the next 30 when the user scrolls near the bottom of the sidebar.

## User story

As a user with more than 30 research threads, I want older threads to load as I scroll so the sidebar opens without loading my full history.

## Scope

- Return at most 30 research threads in the initial sidebar response.
- Return later pages of at most 30 threads.
- Load the next page when the user scrolls near the bottom.
- Keep the existing history order and date groups.
- Do not add duplicate rows when pages join.
- Keep loaded rows when a later request fails and allow the user to retry.
- Stop requesting pages after the server returns no next cursor.

## Non-goals

- Lookout reports or Lookout navigation in the sidebar.
- Archive, recovery, pinning, retention, or automatic archival.
- Search behavior or search result classes.
- A new chat lifecycle model.
- A new Lookout run model.
- Changes to thread content, Eve sessions, documents, artifacts, uploads, or project links.
- A user-configurable page size.

These items require separate product ideas and explicit approval if they are needed later.

## Functional requirements

- **FR-001:** The sidebar initially shows at most 30 owned research threads.
- **FR-002:** The chats API returns an opaque next cursor when older threads remain.
- **FR-003:** Near the bottom of the sidebar, the client requests the next page once.
- **FR-004:** A successful page joins the existing list without duplicate thread IDs.
- **FR-005:** A failed later-page request keeps the existing rows and shows a retry action.
- **FR-006:** A null next cursor stops later requests.

## Technical requirements

- Use bounded cursor pagination. Do not use SQL offsets.
- Use a stable timestamp and thread ID order.
- Apply ownership in the database query.
- Return list metadata only.
- Keep the page size fixed at 30.
- Preserve the existing sidebar scroll container and date grouping.

## Acceptance criteria

- **AC-01:** A user with 31 or more research threads receives 30 rows in the first sidebar page.
- **AC-02:** Scrolling near the bottom loads the next page and keeps the first page visible.
- **AC-03:** Pages with tied timestamps contain no duplicate or missing rows while their ordering values stay unchanged.
- **AC-04:** The sidebar makes no later request after `nextCursor` becomes null.
- **AC-05:** A later-page failure keeps the loaded rows and the retry can load the page.
- **AC-06:** The rendered production sidebar demonstrates the 30-row initial page and later loading.

## Test plan

- History-query tests cover the 30-row limit, cursor ties, middle pages, final pages, malformed cursors, and ownership.
- Sidebar state tests cover page joins, duplicate removal, failure, retry, and exhausted cursors.
- Browser acceptance uses an authenticated account with more than 30 research threads. It verifies the initial page and scrolling behavior in the rendered sidebar.
- Standard repository lint, typecheck, test, check, build, and diff checks apply.

## Eval plan

Model evals do not apply. This change affects deterministic list pagination and browser behavior. It does not change prompts, tools, retrieval, memory, or model routing.

## Deployment, observability, and rollback

- Deploy through the normal MiniScira production process.
- Check the chats API for bounded responses and invalid-cursor failures.
- Check the rendered sidebar for later-page loading and retry behavior.
- Roll back the application image if the API or sidebar fails. The pagination migration is additive and does not delete thread data.

## Open questions

None. The page size and loading behavior are fixed by the approved request.

## Completion evidence

- The bounded history query and cursor contract shipped in `48208d3`.
- Sidebar and project pagination shipped in `29cb6de`.
- Pagination hardening shipped in `e545d7e`.
- Unified sidebar scrolling shipped in `40695fc`.
- Focused automated checks cover the page limit, page joining, failure, retry, and cursor exhaustion.
- Production currently proves the bounded API and rendered sidebar with four research threads. Large-history production acceptance still needs an account with more than 30 research threads before this PRD and its Product Ideas row change to `Done`.
