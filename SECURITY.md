# Security

## Reporting a vulnerability

Please report privately rather than opening an issue: use GitHub's
[private vulnerability reporting](https://github.com/zaidmukaddam/miniscira/security/advisories/new),
or email zaid@scira.ai.

Include what you did, what happened, and what you expected. A proof of concept
helps but is not required.

## What is most worth looking at

This app holds two things worth stealing — a user's AI Gateway key (a live
billing credential) and their research history — so the interesting surfaces
are:

- **`lib/api-auth.ts`** — every `/api/*` route goes through `authed()` /
  `authedWithParams()`, with three deliberate exceptions: `/api/auth/*`
  (better-auth's own handler), `/api/mcp/oauth/callback` (an OAuth redirect
  target that checks the session itself), and `/api/search` (the public docs
  index). Any other route that bypasses it is a bug.
- **`lib/api-ownership.ts`** — authentication proves *who* is asking, nothing
  about which rows are theirs. The `owned*` helpers filter on `userId` in SQL,
  so the predicate cannot be dropped by accident. `requireOwnedChat` is the
  exception: it loads the row and compares in JS so it can tell 404 from 403,
  which makes that one `if` load-bearing.
- **`agent/channels/eve.ts`** — the agent's own auth chain, which is separate
  from the app's. `/eve/v1/*` is rewritten before Next.js routing, so
  `proxy.ts` never sees it.
- **`lib/secret-box.ts`** — AES-256-GCM sealing for stored gateway keys, keyed
  from `BETTER_AUTH_SECRET` via HKDF.

## Known operational footguns

Not vulnerabilities in the code, but the ways a deployment goes wrong:

- **`NODE_ENV` must be `production` on the agent process.** `next start` sets
  it; `eve start` does not. Below production, the auth chain keeps eve's
  `localDev()` entry, which authenticates any request whose Host is loopback —
  and the `/eve/v1/*` rewrite makes every proxied request look exactly like
  that. Verify with an unauthenticated `curl` to `/eve/v1/info`: `401` is
  correct, `200` means the agent is open to the internet.
- **`ALLOW_SHARED_GATEWAY_KEY`** left set in production means every visitor's
  research bills your key.
- **Uploaded documents are stored with `access: "public"`** on Vercel Blob.
  URLs are unguessable, but anyone holding one can read the file without
  authenticating.
- **Rotating `BETTER_AUTH_SECRET` invalidates every stored gateway key.** Users
  are asked for theirs again rather than seeing an error, but they will have to
  re-enter it.
