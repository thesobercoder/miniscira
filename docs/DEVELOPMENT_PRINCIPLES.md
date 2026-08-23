# Development principles

Read this document before you change code or repository structure.

## Product and repository identity

- MiniScira is an independent, Docker-first fork.
- Credit the original project in `README.md`.
- Do not make upstream acceptance a roadmap dependency.
- Treat `origin` as the source of truth for the production fork.
- Treat `upstream` as a read-only source of fixes and ideas.
- Review and adapt useful upstream changes. Do not merge large commits without review.
- Keep the normal product experience simple. Make search, memory, tools, and routing automatic.
- Put provider and infrastructure controls in deployment configuration or advanced/admin pages.

## Engineering workflow

1. Start with a clean working tree.
2. Define acceptance criteria that you can observe.
3. Trace the full affected path before you edit. Include the UI, API, database, Eve events, tools, gateway, storage, and deployment when they apply.
4. Add the smallest regression test that would have caught the problem.
5. Make the smallest complete change. Follow patterns in nearby code.
6. Run focused tests first. Then run all quality gates that apply.
7. Exercise the real user-visible flow. Health checks alone do not prove that it works.
8. Review the diff for secrets, generated files, schema changes, stale documents, and unrelated formatting.

Choose clear code over clever code. Use small named functions, explicit error states, one source of truth, narrow types, and comments that explain why a rule exists. Avoid abstractions for possible future needs. Avoid duplicate state. Do not start a promise without handling its errors. Keep provider-specific behavior out of normal UI components.

## Writing standard

Use simplified technical English in every project document. This includes the README, product docs, PRDs, backlog entries, plans, runbooks, architecture notes, code comments, release notes, and user-facing technical text.

- Use short, direct sentences and common words.
- State the goal, decision, action, and result clearly.
- Define a technical term the first time it is needed.
- Keep exact API names, commands, file paths, and code identifiers unchanged.
- Prefer concrete examples over abstract language.
- Remove jargon, idioms, marketing language, filler, and unnecessary adjectives.
- Do not make the text less accurate to make it simpler. Split a hard idea into clear steps instead.
- Write for a technical reader who may not know this codebase or speak English as a first language.

This standard is required. It is not an optional style choice. Review every new or changed document for this standard before you commit.

## Toolchain

- Use Bun. On Soham's Umbrel deployment, the durable binary is `/opt/data/bin/bun`.
- Run focused tests before broad tests.
- Put unit tests in `*.test.ts` files beside the code they cover.
- Put model-level evals in `evals/*.eval.ts`.
- Use Biome. Do not add Prettier or ESLint configuration.
- `bun run check` can change files. Review its diff and run the tests again.

Run these standard quality gates:

```bash
/opt/data/bin/bun run typecheck
/opt/data/bin/bun run lint
/opt/data/bin/bun test
/opt/data/bin/bun run check
git diff --check
```

## Framework guidance

This repository uses a Next.js version with APIs and rules that may differ from model training data. Before you write Next.js code, read the relevant guide in `node_modules/next/dist/docs/`. Follow its deprecation notices.

Use the simplest canonical solution supported by the installed framework and nearby repository code. Most application problems already have a standard Next.js, React, browser-platform, or library pattern. Search the installed documentation and existing source first. Follow that pattern instead of creating a new mechanism.

Complexity requires proof, not preference. Do not add custom routing layers, manual URL synchronization, private framework state, duplicate state machines, abstractions for possible future needs, or compatibility workarounds when a public framework API or ordinary web-platform pattern solves the requirement. Start with the smallest direct implementation. Add only the complexity required by reproduced behavior. Give each piece of state one owner.

For Next.js routing, let the App Router own navigation, URL state, mounted route trees, and history through documented public APIs such as `Link`, `redirect`, and `useRouter`. Do not use hard reloads, raw anchors as routing workarounds, native History API mutations that leave the route tree behind, or private Next.js internals. Test navigation in a real browser. A changed URL alone does not prove that the router tree and rendered state are synchronized.

## Source-control completion

After a successful production deployment:

1. Commit every intended repository change.
2. Push `main` to `origin`.
3. Verify that the working tree is clean.
4. Fetch `origin`.
5. Verify that local `HEAD` equals `origin/main`.

If verification or deployment fails, do not hide or discard an intended change. Keep the change and report the blocker.
