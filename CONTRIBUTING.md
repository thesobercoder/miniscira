# Contributing

MiniScira is an independently maintained, Docker-first fork. Contributions are
welcome when they preserve portable self-hosting, local data ownership, the
simple product experience, and the repository invariants in `AGENTS.md`.

## Set up a development environment

You need Bun, Postgres with pgvector, and an OpenAI-compatible gateway.

```bash
git clone https://github.com/thesobercoder/miniscira.git
cd miniscira
bun install
cp .env.example .env.local
```

Set the required database, gateway, and Better Auth values described in
`.env.example`, then:

```bash
bun run db:setup
bun run db:push
bun run dev
```

`bun run dev` starts both Next.js and the Eve agent. A Next.js build alone does
not build or start Eve.

For production-like testing, prefer the Docker Compose path documented in
`README.md` and `docs/DEPLOYMENT.md`.

## Before changing code

1. Read `AGENTS.md`.
2. Define an observable acceptance criterion or reproduce the bug.
3. Inspect adjacent code and tests before introducing an abstraction.
4. Trace the whole affected path—UI, API, database, Eve events, tools, gateway,
   storage, and deployment where relevant.
5. Add the smallest useful regression test.

Comments should explain *why* a constraint exists, especially when the safest
code looks unusual. Prefer explicit failure states and narrow functions over
clever or speculative abstractions.

## Quality gates

Run focused tests during development, then all baseline checks:

```bash
bun run typecheck
bun run lint
bun test
bun run check
git diff --check
```

`bun run check` writes fixes. Inspect the resulting diff and rerun tests.

When relevant, also run:

```bash
bun run build
bunx eve build
bun run knip
```

Agent, prompt, retrieval, model-routing, and tool changes should run the related
`evals/*.eval.ts`. These use real model tokens, so run the focused evaluations
that exercise your change.

Docker, Eve, middleware, egress, or sandbox changes require the acceptance suite
in `docs/UMBREL_SANDBOX_OPERATIONS.md`, including a real file-write-and-execute
proof—not merely a successful container spawn.

## Upstream changes

The original project remains a valuable source of fixes and ideas. Do not merge
large upstream commits blindly. Review individual changes and adapt useful
behavior around this fork's Docker, local-storage, gateway, authentication, and
security architecture.

## Important invariants

- `agent/channels/eve.ts` authentication is ordered; first success wins.
- Only `eventType()` in `lib/chat-events.ts` may read `.type` from an opaque Eve
  event.
- Long-running root and subagent streams share `lib/eve-stream-policy.ts`.
- Normal startup does not mutate the database schema; use committed migrations.
- Uploads and generated artifacts are local-storage-first.
- The MiniScira app never receives the Docker socket or Portainer credentials.
- The two-process Next.js + Eve lifecycle must remain intact.

`AGENTS.md` contains the complete list.

## Formatting and dependencies

Biome is the formatter and linter. Do not add Prettier or ESLint configuration.
Avoid adding a dependency for behavior that can be expressed clearly with the
existing stack.

## Security reports

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).
