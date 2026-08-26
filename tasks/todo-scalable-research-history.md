# Paged research history implementation record

- **Status:** Done
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-scalable-research-history)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)

This record maps the approved pagination scope in `tasks/prd-scalable-research-history.md` to the delivered work and its checks.

## Delivered work

1. Add a bounded history query with a fixed 30-row page size and an opaque cursor.
2. Return `nextCursor` from the chats API.
3. Render the first page in the sidebar.
4. Request the next page when the user scrolls near the bottom.
5. Join pages without duplicate thread IDs.
6. Keep loaded rows after a later-page failure and allow retry.
7. Stop when the server returns `nextCursor: null`.

## Acceptance mapping

| Acceptance ID | Delivered behavior | Check |
|---|---|---|
| `AC-01` | Fixed 30-row first page. | `lib/history.test.ts`: first page has 30 rows and a next cursor. |
| `AC-02` | The sidebar end sentinel requests the next cursor. | `components/chat-list.tsx`; authenticated production browser acceptance. |
| `AC-03` | Stable cursor order and page de-duplication. | `lib/history.test.ts`; `lib/chat-list-events.test.ts`. |
| `AC-04` | A null next cursor produces no next-page intent. | `lib/chat-list-events.test.ts`: exhausted cursor request is ignored. |
| `AC-05` | Failed page loads keep rows and permit retry. | `lib/chat-list-events.test.ts`: failure and retry case. |
| `AC-06` | The production sidebar loads older rows after the first 30. | Authenticated production browser acceptance. |

## Production acceptance

- An authenticated production account had 37 eligible research threads.
- The initial rendered sidebar contained 30 threads and showed the next-page control.
- Activating the control loaded the remaining seven threads.
- The final rendered total matched the database count, with no next-page control after the final page.

Model evals do not apply because this work does not change agent behavior.
