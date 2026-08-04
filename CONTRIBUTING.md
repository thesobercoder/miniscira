# Contributing

Thanks for looking. This is a small project, so the process is short.

## Setting up

You need [Bun](https://bun.sh), a [Neon](https://neon.tech) database, and a
[Vercel AI Gateway](https://vercel.com/ai-gateway) key.

```bash
git clone https://github.com/zaidmukaddam/miniscira
cd miniscira
bun install
cp .env.example .env.local
```

Fill in `AI_GATEWAY_API_KEY`, `DATABASE_URL`, and `BETTER_AUTH_SECRET`, then:

```bash
bun run db:setup   # creates the pgvector extension, once per database
bun run db:push    # applies the schema
bun run dev
```

Set `ALLOW_SHARED_GATEWAY_KEY=true` locally. Without it, chat turns require you
to save your own gateway key in Settings first — correct in production, a
nuisance while developing.

`bun run dev` starts Next.js **and** the eve agent together. If chat requests
start 502-ing, the agent process has usually died on a compile error; check the
dev server output and restart, because `eve dev` does not recover from a failed
rebuild on its own.

## Before you open a pull request

```bash
bun run typecheck && bun run lint && bun test
```

CI runs these first, then the three below. Run those locally too when your
change touches the relevant area:

```bash
bun run build      # the Next build; catches page-data and bundling failures
bunx eve build     # the agent build; `next build` does NOT cover it
bun run knip       # unused exports
```

`bunx eve eval` runs the model-level evals in `evals/`. They cost real tokens,
so run the ones related to your change rather than the whole suite.

Formatting and linting are [Biome](https://biomejs.dev) — `bun run check` writes
fixes. Prettier and ESLint were removed deliberately; please don't add them back.

## Things that will bite you

These are the non-obvious ones. `AGENTS.md` has the full list, and the
[architecture docs](https://miniscira.com/docs/architecture) explain the why.

- **`agent/channels/eve.ts` — the `auth:` array is ordered.** First entry that
  resolves wins. Reordering it changes which principal authenticates a request.
- **`lib/chat-events.ts` — `eventType()` is the only place allowed to read
  `.type`.** eve's event payloads are not one discriminated union; everything
  else goes through the exported predicates.
- **`lib/lookout-schedule.ts` only understands two cron shapes.** `M H * * *`
  and `M H * * D`. Anything else silently never fires.
- **A tool's filename is its name.** `agent/tools/x_search.ts` is `x_search`.
  Renaming `web_search.ts` re-enables eve's built-in one, with no error.
- **`next.config.ts` wrapper order is load-bearing.** `withEve(withMDX(config))`
  — `createMDX()` only takes a plain object, `withEve` returns the function form.
- **Don't add `import "server-only"` to anything the agent imports.** eve's
  bundler evaluates it as a Client Component check and the build fails.

## Style

Match the surrounding code. The one house rule worth stating: comments explain
*why*, especially when the code looks wrong but isn't. Several bugs here were
fixed twice because the first fix had no comment saying what it was for.

## Reporting a security issue

Please don't open a public issue. See [SECURITY.md](SECURITY.md).
