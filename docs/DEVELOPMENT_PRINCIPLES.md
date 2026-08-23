# Development principles

Read this document before you change code or repository structure.

## Product and repository identity

- MiniScira is an independent, Docker-first fork.
- Credit the original project in `README.md`.
- Do not make upstream acceptance a roadmap dependency.
- Treat `origin` as the authoritative production fork.
- Treat `upstream` as a read-only source of fixes and ideas.
- Inspect and adapt useful upstream changes. Do not merge large commits without review.
- Keep the normal product experience simple. Search, memory, tools, and routing should be automatic.
- Put provider and infrastructure controls in deployment configuration or advanced/admin surfaces.

## Engineering workflow

1. Start from a clean tree.
2. Define observable acceptance criteria.
3. Trace the full affected path before editing. Include UI, API, database, Eve events, tools, gateway, storage, and deployment when they apply.
4. Add the smallest regression test that would have caught the problem.
5. Implement the smallest coherent change with adjacent repository patterns.
6. Run focused tests first, then the full applicable quality gates.
7. Exercise the real user-visible flow. Health checks alone are not enough.
8. Review diffs for secrets, generated artifacts, schema changes, stale documentation, and unrelated formatting.

Optimize code for clarity over cleverness. Use small named functions, explicit error states, one source of truth, narrow types, and comments that explain why an invariant exists. Avoid speculative abstractions, duplicate state, fire-and-forget promises without an error path, and provider-specific behavior in ordinary UI components.

## Toolchain

- Use Bun. The durable binary is `/opt/data/bin/bun` on Soham's Umbrel deployment.
- Run focused tests before broad tests.
- Unit tests are `*.test.ts` beside the code they cover.
- Model-level evals are `evals/*.eval.ts`.
- Use Biome. Do not add Prettier or ESLint configuration.
- `bun run check` can change files. Inspect its diff and rerun tests.

Standard quality gates:

```bash
/opt/data/bin/bun run typecheck
/opt/data/bin/bun run lint
/opt/data/bin/bun test
/opt/data/bin/bun run check
git diff --check
```

## Framework guidance

This repository uses a Next.js version with APIs and conventions that can differ from model training data. Before you write Next.js code, read the relevant guide in `node_modules/next/dist/docs/` and follow its deprecation notices.

Prefer the simplest canonical solution supported by the installed framework and adjacent repository code. Most application problems already have an established Next.js, React, browser-platform, or library pattern: search the installed documentation and existing source first, then follow that pattern rather than inventing a new mechanism.

Complexity requires proof, not preference. Do not introduce custom routing layers, manual URL synchronization, private framework state, duplicated state machines, speculative abstractions, or compatibility workarounds when a public framework API or ordinary web-platform pattern solves the requirement. Start with the smallest direct implementation, add only the complexity required by reproduced behavior, and keep one owner for each piece of state.

For Next.js routing, let the App Router own navigation, URL state, mounted route trees, and history through documented public APIs such as `Link`, `redirect`, and `useRouter`. Do not use hard reloads, raw anchors as routing workarounds, native History API mutations that leave the route tree behind, or private Next.js internals. Verify navigation in a real browser because a changed URL alone does not prove the router tree and rendered state are synchronized.

## Source-control completion

After a successful production deployment:

1. Commit every intended repository change.
2. Push `main` to `origin`.
3. Verify a clean working tree.
4. Fetch `origin`.
5. Verify local `HEAD` equals `origin/main`.

Do not hide or discard an intended change when verification or deployment fails. Preserve it and report the blocker.
