# Engineering invariants

Read this document before you change authentication, chat events, scheduling, models, streaming, attachments, global styles, or motion.

An invariant is a rule that must remain true.

## Authentication

- `agent/channels/eve.ts` contains an ordered `auth:` chain.
- The first entry that succeeds sets the principal.
- Do not sort or reorder the chain without a specific reason and review.

## Eve chat events

- Eve event payloads do not form one discriminated union.
- Only `eventType()` in `lib/chat-events.ts` may read `.type` from an opaque event.
- Use the exported predicates everywhere else.

## Lookout scheduling

- The Lookouts UI emits only daily `M H * * *` and weekly `M H * * D` UTC cron expressions.
- `lib/lookout-schedule.ts` depends on these shapes.
- Lookouts use a database lease. The minute-tick Eve schedule in `agent/schedules/lookouts.ts` drives the lease.
- Lookouts do not use QStash or another external queue.

## Models

- `lib/models.ts` defines the model picker metadata and default model.
- `agent/agent.ts` applies the model that the user selects for each turn.
- The live AI Gateway catalog is the source of truth for model availability and context-window lookup.
- Keep picker metadata, default model resolution, routing, and context-window calculations consistent.

## Durable streams

- Root and delegated Eve streams use `lib/eve-stream-policy.ts`.
- Do not replace durable reconnection with a short SDK default.
- A research run can continue through proxy resets, browser network changes, and temporary gateway failures.

## Attachments

- `hooks/use-chat-attachments.ts` owns browser object URLs.
- For every `URL.createObjectURL`, clean up the old URL when you replace or remove it. Also clean up all URLs when the component unmounts.
- File parts sent to a model must use data URLs. The AI SDK blocks attachment downloads from private hosts.

## Global styles and motion

- Keep the `shadcn/tailwind.css` import in `app/globals.css`.
- Use the motion tokens in `app/globals.css`. Do not add one-off cubic-bezier values.

Use these easing rules:

- Entering or exiting: `ease-out-strong`.
- Moving or morphing on screen: `ease-in-out-strong`.
- Hover or color change: `ease`.
- Constant motion: `linear`.

Use these duration ranges:

| Element | Duration |
|---|---:|
| Button press feedback | 100–160 ms |
| Tooltips and small popovers | 125–200 ms |
| Dropdowns and selects | 150–250 ms |
| Modals and drawers | 200–500 ms |
