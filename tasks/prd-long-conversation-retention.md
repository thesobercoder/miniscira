# PRD: Long-conversation retention

- **Status:** To do
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-long-conversation-retention)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Not approved

## Goal

### Problem

MiniScira can lose older conversation context when it compacts a long Eve session or starts a replacement Eve session. The current replacement-session recap includes only the last eight visible messages and at most 6,000 characters. The repository has no controlled test that proves early facts survive compaction, reload, restart, and replacement-session reconstruction.

Older conversation loss is not acceptable.

### Evidence

- `agent/agent.ts` configures compaction at 85 percent of a 200,000-token context window.
- `lib/chat-context.ts` limits the replacement-session recap to eight messages and 6,000 characters.
- `hooks/use-eve-chat.ts` uses that recap when it creates a fresh Eve session.
- Production `chat_event` data has no `compaction.requested` or `compaction.completed` event types.
- No existing `*.eval.ts` test forces compaction and checks old-fact recall.

### User outcome

A user can continue one research conversation for as long as the product permits without silently losing important facts from earlier turns.

## User stories

## Scope

## Non-goals

- Sending the entire event history to every model call.
- Treating nightly cross-chat memory as a replacement for same-thread context.
- Hiding loss behind a larger context-window setting.
- Changing DeerFlow.

## Functional requirements

## Technical requirements

### Implementation plan

See `/opt/data/reports/miniscira-next-steps/implementation-plan.md`, Phase 1.

## Acceptance criteria

- [ ] A deterministic eval introduces unique facts in early, middle, and recent turns.
- [ ] The eval forces at least two compaction cycles.
- [ ] All facts survive continuous-session compaction.
- [ ] All facts survive browser reload and Eve continuation.
- [ ] All facts survive application restart.
- [ ] All facts survive branching from a long conversation.
- [ ] All facts survive retry and edit rewinds.
- [ ] All facts survive replacement of an unavailable Eve session.
- [ ] The selected model's real context limit controls compaction timing.
- [ ] The compaction model authenticates through deployment and per-user routing modes.
- [ ] Tool results, citations, and attachment references from before compaction remain usable.
- [ ] UI history paging does not affect model context.
- [ ] A failure identifies the boundary that lost the fact.
- [ ] Full `chat_event` history remains the source of truth.
- [ ] Any persisted summary has a source-event watermark and can be rebuilt idempotently.
- [ ] The full MiniScira test suite passes.
- [ ] A scratch deployment passes the real authenticated long-thread test with synthetic facts.

## Deployment

## Observability

## Rollback

## Open questions
