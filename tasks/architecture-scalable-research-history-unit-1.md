# Paged research history implementation notes

- **Status:** Implementation record.
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-scalable-research-history)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)

## Pagination contract

`lib/history.ts` owns the server pagination contract.

- `HISTORY_PAGE_SIZE` is 30.
- Active research pages use a stable timestamp and thread ID order.
- The query requests 31 rows, returns at most 30, and creates `nextCursor` only when another row exists.
- The cursor is opaque, owner-bound, scope-bound, and validated by the server.
- `GET /api/chats` returns list metadata and `nextCursor`.
- `components/chat-list.tsx` requests the next cursor through an intersection sentinel near the bottom of the sidebar.
- `lib/chat-list-events.ts` joins pages, removes duplicate IDs, retains bounded client state, and preserves loaded rows after a failed request.

## Data changes already shipped

Migration `0004_scalable-research-history-unit-1` added pagination indexes and additive lifecycle fields. The approved product request does not include archive, recovery, automatic archival, or a new Lookout experience. Those fields do not authorize those features.

The migration preserves existing chats and related data. The pagination path uses the active-history ordering field and the matching index.

## Checks

- `lib/history.test.ts` covers cursor validation, ownership, stable order, the 30-row limit, and first, middle, and final pages.
- `lib/chat-list-events.test.ts` covers page joining, duplicate removal, retry, cursor exhaustion, and bounded client state.
- Production browser acceptance used an account with 37 eligible research threads. The first render contained 30 threads. Activating the next-page control loaded the remaining seven, and the control disappeared after the final page.
