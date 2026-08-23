# Project conventions

## Product and repository identity

- This is an independent, Docker-first fork. The original MiniScira is credited
  in `README.md`, but upstream acceptance is not a roadmap dependency.
- Keep `origin` as the authoritative production fork. Treat `upstream` as a
  read-only source of fixes and ideas: fetch it, inspect individual changes, and
  adapt useful behavior surgically rather than merging large commits blindly.
- Generic Docker Compose behavior belongs in `README.md`, `.env.example`,
  `docker-compose.yml`, and `docs/DEPLOYMENT.md`. Installation-specific Umbrel
  and Portainer details belong only in `docs/UMBREL_SANDBOX_OPERATIONS.md`.
- The normal product experience stays simple. Search, memory, tools, and routing
  should happen automatically; provider and infrastructure controls belong in
  deployment configuration or advanced/admin surfaces.

## Engineering workflow

1. Start from a clean tree and state the observable acceptance criteria.
2. Trace the complete affected path before editing: UI, API, database, Eve
   events, tools, gateway, storage, and deployment where relevant.
3. Add the smallest regression test that would have caught the problem.
4. Implement the smallest coherent change using adjacent repository patterns.
5. Run focused tests first, then the full quality gates before deployment.
6. Exercise the real user-visible flow. Health checks alone are insufficient.
7. Review diffs for secrets, generated artifacts, schema changes, stale docs,
   and unrelated formatting before committing.

Code should optimize for clarity over cleverness: small named functions,
explicit error states, one source of truth, narrow types, and comments that
explain *why* an invariant exists. Avoid speculative abstractions, duplicate
state, fire-and-forget promises without an error path, and provider-specific
behavior leaking into ordinary UI components.

## Product planning and execution lifecycle

Follow this order exactly: **raw backlog idea → PRD → user approval → TODO tasks →
execution → verified completion**.

### 1. Backlog: preserve raw ideas

- Record concrete raw ideas in `docs/PRODUCT_IDEAS.md` first. A backlog entry may
  be brief and incomplete; it preserves an idea but does not authorize work.
- Track the idea's lifecycle explicitly, using a status such as `Backlog`,
  `PRD in progress`, `PRD approved`, `In progress`, or `Done`.

### 2. PRD: specify the selected idea

- Before implementation, promote a selected idea into a complete PRD at
  `tasks/prd-<feature-name>.md` and link the backlog entry to it.
- The PRD must define goals, user stories, scope, non-goals, functional and
  technical requirements, acceptance criteria, testing, evals, deployment,
  observability, rollback, and open questions.
- It must determine the model-level eval strategy for changes to agent behavior,
  prompts, tools, retrieval, memory, or model routing: cases, datasets/fixtures,
  expected outcomes, and pass thresholds. If evals do not apply, say why.
- A written PRD is not approved by implication. Ask the user to review it; record
  approval only after the user explicitly approves it.
- Once the PRD is complete and explicitly user-approved, the **PRD planning work**
  may be marked done. This means the specification phase is done—not that the
  feature itself has been implemented. Update the backlog status to `PRD approved`.

### 3. TODO tasks: the agent's executable work queue

- After PRD approval, derive the implementation work into the agent's TODO list.
  TODO items are the concrete units the agent will actually work on and track.
- TODOs must be ordered, atomic, and small enough to complete and verify without
  combining unrelated changes. Name dependencies and affected areas/files where
  known.
- Map every PRD acceptance criterion to one or more TODOs and to exact applicable
  unit, integration, browser/end-to-end, authorization/security,
  migration/rollback, eval, deployment, and production acceptance checks.
- Keep only one TODO `in_progress` at a time. Mark a TODO `completed` immediately
  after its implementation and required verification pass. If it fails or its
  approach becomes invalid, mark it `cancelled` and add a corrected replacement.
- The TODO list is execution state, not a substitute for the durable PRD. Do not
  copy temporary task progress into durable memory or rewrite the PRD merely to
  reflect day-to-day execution status.

### 4. Execution and completion

- Do not execute implementation directly from a raw backlog entry or an
  unapproved PRD. Begin only after explicit PRD approval and creation of the
  derived TODO/test/eval plan.
- Change the backlog status to `In progress` when implementation starts.
- A feature may be marked `Done` only after every required TODO and mapped
  acceptance check has passed, the real user-visible flow has been exercised,
  production deployment has been verified when applicable, and repository state
  satisfies the production source-control invariant.
- Keep the approved PRD as the durable record of intent and acceptance. Preserve
  evidence of completion in the normal commits, tests, eval results, and relevant
  operational documentation rather than claiming completion from code changes or
  health checks alone.

## Toolchain

- Package manager is **bun**. Install with `bun install`, run scripts with `bun run <script>`.
- Verify changes with `bun run typecheck` (`tsc --noEmit`), `bun run lint`, and
  `bun test` (unit tests are `*.test.ts` beside the code they cover — `lib/`,
  `components/`, `hooks/`, `app/api/`, and `proxy.test.ts` at the root).
  Model-level evals are `evals/*.eval.ts`.
- Formatter and linter are **biome** (`bun run format`, `bun run check`).
  Do **not** add prettier or eslint config; they were deliberately removed.
- `bun run check` writes formatting/lint fixes. Inspect its diff and rerun tests;
  an auto-fixer's exit code is not proof that behavior is correct.

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
- Long-running root and delegated Eve streams use the shared policy in
  `lib/eve-stream-policy.ts`. Do not disable subagent reconnection or replace it
  with a short SDK default: durable research may cross proxy resets, temporary
  gateway failures, or browser network changes.
- `hooks/use-chat-attachments.ts` owns browser object URLs. Every
  `URL.createObjectURL` needs immediate replacement/removal cleanup and unmount
  cleanup; uploads and generated files remain local-storage-first.

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
