# MiniScira fork foundations implementation plan

> **For Hermes:** Use subagent-driven development. Complete one task at a time. Preserve MiniScira's production and data safety rules.

**Goal:** Make MiniScira an independently maintained, portable Docker-first product. Fix reliability problems in long research streams. Apply selected upstream fixes. Document clear engineering rules.

**Architecture:** `origin` is the source of truth. Keep `upstream` read-only and use it for ideas and fixes. Compare each upstream change with the diverged local code, then apply only the needed local patch. Test the browser, Eve, gateway, Compose stack, Postgres, uploads, and Docker Sandbox as one product path.

**Tech Stack:** Bun, TypeScript, Next.js 16, React 19, Eve, Postgres/pgvector, Docker Compose, Portainer/Umbrel production validation.

---

### Task 1: Record a reliable baseline

**Files:**
- Read: `AGENTS.md`
- Read: `README.md`
- Read: `docs/DEPLOYMENT.md`
- Read: `docs/UMBREL_SANDBOX_OPERATIONS.md`

**Steps:**
1. Verify a clean `main`, remotes, HEAD/origin equality, and current upstream divergence.
2. Record production container identity, start time, restart count, health, and current logs.
3. Inspect recent persisted chat cursors and event counts without changing data.
4. Confirm whether reported interruptions correlate with container restarts, transport detachments, or model/gateway failures.

### Task 2: Make long parent and subagent streams recover from disconnects

**Files:**
- Create: `lib/eve-stream-policy.ts`
- Create: `lib/eve-stream-policy.test.ts`
- Modify: `hooks/use-eve-chat.ts`
- Modify: `hooks/use-subagent-streams.ts`
- Test: `hooks/use-eve-chat.test.ts`

**Steps:**
1. Add a failing policy test that requires long-running streams to tolerate a meaningful outage window.
2. Define one explicit shared Eve reconnect policy instead of relying on short SDK defaults.
3. Apply it to parent-turn reattachment and child-session streams.
4. Ensure completed subagents stop following, while transient disconnects do not permanently mark a child as attached-but-dead.
5. Run focused tests, typecheck, and lint.
6. Exercise a real long-running/delegated turn and verify persisted completion plus rendered output.

### Task 3: Apply selected upstream fixes

**Files:**
- Modify: `components/settings-provider.tsx`
- Modify: `hooks/use-chat-attachments.ts`
- Modify: `components/projects-grid.tsx`
- Modify: `components/ui/carousel.tsx`
- Modify relevant PDF preview component(s)
- Add focused tests where behavior is extractable

**Steps:**
1. Re-read each upstream hunk against current local code.
2. Add settings rollback and explicit HTTP/JSON failure handling.
3. Correct object-URL cleanup without adopting Vercel Blob storage.
4. Add synchronous duplicate-project protection.
5. Unsubscribe every carousel listener registered.
6. Sandbox user-uploaded PDF previews.
7. Exclude broad refactors, dependency bundles, and score-chasing changes without demonstrated value.
8. Run focused and full checks.

### Task 4: Document the independent Docker product

**Files:**
- Modify: `README.md`
- Modify: `docs/DEPLOYMENT.md`
- Modify: `.env.example` if documentation exposes a real mismatch
- Preserve: `LICENSE`

**Steps:**
1. Lead with portable Docker Compose deployment rather than upstream contribution context.
2. Clearly state that this is an independently maintained fork with substantial architectural divergence.
3. Credit Zaid Mukaddam and link the original MiniScira project.
4. Document bundled and external Postgres paths, gateway requirements, volumes, migrations, health, backups, upgrades, reverse proxying, and architecture limits.
5. Keep Umbrel-specific operations in their dedicated runbook rather than presenting Umbrel as required.
6. Verify rendered documentation and every command shown.

### Task 5: Improve repository engineering rules

**Files:**
- Modify: `AGENTS.md`
- Create if useful: `CONTRIBUTING.md`
- Modify: `package.json` only when a verified check is missing

**Steps:**
1. Define ownership: `origin` is product authority; `upstream` is inspiration and review input.
2. Codify clean-code rules, module boundaries, error handling, tests, documentation parity, security, and deployment acceptance.
3. Require focused tests first, then typecheck, lint, full tests, check, and `git diff --check`.
4. Require real user-path verification for research, streaming, uploads, auth, and Sandbox changes.
5. Keep guidance concise enough that coding agents will actually follow it.

### Task 6: Close the obsolete upstream PR

**Files:**
- No source file required unless a durable rationale is missing from documentation/history.

**Steps:**
1. Verify the exact open PR and its current state through GitHub API.
2. Leave a respectful closing comment explaining that the fork has diverged into an independent Docker-first product.
3. Thank the original author and preserve credit.
4. Close only Soham's PR; do not modify upstream branches or issues.

### Task 7: Release the foundation changes

**Steps:**
1. Run focused tests for every changed area.
2. Run `/opt/data/bin/bun run typecheck`, `lint`, `test`, `check`, and `git diff --check`.
3. Build a uniquely tagged candidate image.
4. Run Docker Sandbox validation when the image/Eve/runtime path changed; require `RESULT: ALL PASS`.
5. Back up production stack metadata and preserve its environment.
6. Deploy/recreate production and verify immutable image identity, restart count, both health endpoints, and a real long-running delegated research turn.
7. Review diffs for secrets and unrelated changes.
8. Commit in coherent units, push `origin/main`, and verify clean local HEAD equals `origin/main`.

### Deferred product work

Do not implement backlog items, including uploaded-image editing, until the foundation changes are complete. Keep the backlog document and its accepted entries.
