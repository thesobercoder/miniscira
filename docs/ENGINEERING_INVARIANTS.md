# Engineering invariants

Read this document before you change authentication, chat events, scheduling, models, streaming, attachments, global styles, or motion.

## Authentication

- `agent/channels/eve.ts` contains an ordered `auth:` chain.
- The first successful entry determines the principal.
- Do not sort or casually reorder it.

## Eve chat events

- Eve event payloads are not one discriminated union.
- `eventType()` in `lib/chat-events.ts` is the only place that can read `.type` from an opaque event.
- Use the exported predicates everywhere else.

## Lookout scheduling

- The Lookouts UI emits only daily `M H * * *` and weekly `M H * * D` UTC cron expressions.
- `lib/lookout-schedule.ts` assumes these shapes.
- Lookouts use an in-database lease driven by the minute-tick Eve schedule in `agent/schedules/lookouts.ts`.
- There is no QStash or external queue.

## Models

- `lib/models.ts` defines picker metadata and the default model.
- `agent/agent.ts` applies the user's selected model per turn.
- The live AI Gateway catalog is authoritative for availability and context-window lookup.
- Keep model picker metadata, default resolution, routing, and context-window calculations aligned.

## Durable streams

- Root and delegated Eve streams use `lib/eve-stream-policy.ts`.
- Do not replace durable reconnection with a short SDK default.
- Research runs can cross proxy resets, browser network changes, and temporary gateway failures.

## Attachments

- `hooks/use-chat-attachments.ts` owns browser object URLs.
- Every `URL.createObjectURL` needs immediate replacement/removal cleanup and unmount cleanup.
- Model-facing file parts must use data URLs because the AI SDK blocks private-host attachment downloads.

## Global styles and motion

- Preserve the `shadcn/tailwind.css` import in `app/globals.css`.
- Use motion tokens defined in `app/globals.css`. Do not add one-off cubic-bezier values.

Easing rules:

- entering or exiting: `ease-out-strong`;
- moving or morphing on screen: `ease-in-out-strong`;
- hover or color change: `ease`;
- constant motion: `linear`.

Duration ranges:

| Element | Duration |
|---|---:|
| Button press feedback | 100–160 ms |
| Tooltips and small popovers | 125–200 ms |
| Dropdowns and selects | 150–250 ms |
| Modals and drawers | 200–500 ms |
