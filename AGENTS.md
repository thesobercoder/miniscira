# Project conventions

## Toolchain

- Package manager is **bun**. Install with `bun install`, run scripts with `bun run <script>`.
- Verify changes with `bun run typecheck` (`tsc --noEmit`), `bun run lint`, and
  `bun test` (unit tests are `*.test.ts` beside the code they cover — `lib/`,
  `components/`, `hooks/`, `app/api/`, and `proxy.test.ts` at the root).
  Model-level evals are `evals/*.eval.ts`.
- Formatter and linter are **biome** (`bun run format`, `bun run check`).
  Do **not** add prettier or eslint config; they were deliberately removed.

## Non-obvious invariants

- `docs/UMBREL_SANDBOX_OPERATIONS.md` is the canonical operations and
  maintenance runbook for Soham's Umbrel/Portainer Stack 30 deployment. Read it
  before changing Docker/Eve integration, Compose, the middleware, egress,
  deployment scripts, or accepting upstream changes.
- The production sandbox is **not DinD**. Eve creates sibling containers on the
  Umbrel Docker Engine through a private default-deny middleware. Only the
  middleware mounts `/data/docker.sock`; the app receives `DOCKER_HOST` and no
  Portainer credential. Never mount the Docker socket into the app or publish a
  Docker API port.
- Sandbox file writes depend on a bidirectional attached Docker Exec stream. A
  spawn-only test is not enough. Every middleware/Docker integration change
  must prove `writeTextFile({path: "main.py", ...})` followed by execution. A
  persistent `cat > /workspace/main.py` process means the upload stream is
  deadlocked and the Agent UI will remain busy.
- Sandbox containers must carry exact label `eve.sandbox=1`, use an allowlisted
  image, and attach only to `miniscira_sandbox-egress`. The app and Docker
  middleware use `miniscira_docker-control`; Sandboxes must never reach it.
- The middleware's fixed root base-setup command is coupled to Eve internals.
  When upgrading `eve`, inspect Docker create/Exec/archive/Template/network
  request shapes before widening policy, then run the full scratch acceptance
  suite on port 8326.
- Local image tags are mutable. Record and compare immutable Docker image IDs,
  and recreate the Stack service after rebuilding a local tag.

- `agent/channels/eve.ts` — the `auth:` array is an **ordered** chain
  (app session → internal run secret → Vercel OIDC → local-dev loopback).
  The first entry that resolves wins, so reordering it changes which principal
  authenticates a request. Do not sort or "tidy" it.
- `lib/chat-events.ts` — eve's event payloads are not one discriminated union,
  so `eventType()` is the **only** place allowed to read `.type` off an opaque
  event. Everything else must go through the exported predicates.
- `lib/lookout-schedule.ts` — the lookouts UI only ever emits two UTC cron
  shapes (`M H * * *` daily, `M H * * D` weekly) and the parser assumes it.
  Emitting any other cron shape from the UI will silently fail to schedule.
- `agent/schedules/lookouts.ts` — scheduling is an in-database lease driven by a
  minute-tick eve schedule. There is no QStash / external queue; some stale
  comments elsewhere in the code still mention one.
- `app/globals.css` imports `shadcn/tailwind.css`, which supplies the
  `data-open` / `data-closed` Tailwind variants the overlay animations depend
  on. Do not drop the `shadcn` dependency or that import.
- `lib/models.ts` holds the featured picker list and `DEFAULT_CHAT_MODEL`; the
  live model is chosen per turn in `agent/agent.ts` from the user's picker
  choice and sent as-is; only its *context window* is looked up in the AI
  Gateway catalog. Changing one without the other desyncs context-window math.

## Motion tokens

Durations and easing curves are **not** hand-typed at call sites. The easing
tokens live in the `@theme inline` block in `app/globals.css` and are available
as Tailwind utilities:

| Token | Utility | Value | Use for |
|---|---|---|---|
| `--ease-out-strong` | `ease-out-strong` | `cubic-bezier(0.23, 1, 0.32, 1)` | entering / exiting UI |
| `--ease-in-out-strong` | `ease-in-out-strong` | `cubic-bezier(0.77, 0, 0.175, 1)` | on-screen movement |
| `--ease-drawer` | `ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | iOS-like drawer / sheet curve |

They are named with a `-strong` suffix so they do not override Tailwind's
built-in `ease-out` / `ease-in-out` utilities app-wide; a site opts in
explicitly.

Easing decision rule:

- entering or exiting → `ease-out-strong`
- moving or morphing on screen → `ease-in-out-strong`
- hover / colour change → `ease`
- constant motion (spinners, marquees) → `linear`

Duration budget — pick the Tailwind `duration-*` class inside these ranges:

| Element | Duration |
|---|---|
| Button press feedback | 100–160ms |
| Tooltips, small popovers | 125–200ms |
| Dropdowns, selects | 150–250ms |
| Modals, drawers | 200–500ms |

Do not introduce a new hand-typed `ease-[cubic-bezier(...)]` in app code. If
none of the tokens fits, add a token rather than a one-off curve.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
