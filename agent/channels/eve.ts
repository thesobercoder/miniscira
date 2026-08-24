import { createHash, timingSafeEqual } from "node:crypto"

import { type AuthFn, localDev, vercelOidc } from "eve/channels/auth"
import { eveChannel } from "eve/channels/eve"

import { auth } from "@/lib/auth"

// Resolve the inbound caller from the better-auth session cookie. The browser
// sends the cookie on every same-origin /eve/v1/* request, so this maps a
// signed-in app user to a `user` principal the agent can scope work to.
function appSession(): AuthFn<Request> {
  return async (request) => {
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) return null // not signed in → fall through to the next entry

    return {
      authenticator: "better-auth",
      principalType: "user",
      principalId: session.user.id,
      attributes: {
        email: session.user.email,
        name: session.user.name,
      },
    }
  }
}

// Server-to-server auth for headless runs (lookouts). The lookout runner calls
// /eve/v1 on our own origin with a shared secret + the owner's id, so the agent
// runs as that user (scoped tools, their document index). The secret never leaves
// the server, so external callers cannot forge it.
/**
 * Constant-time secret comparison.
 *
 * `a !== b` short-circuits at the first differing byte, so response latency
 * correlates with how many leading characters the guess got right. Hashing both
 * sides first gives two equal-length digests, which is what `timingSafeEqual`
 * requires — comparing the raw strings would throw on a length mismatch and
 * leak the length besides.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest()
  const b = createHash("sha256").update(expected).digest()
  return timingSafeEqual(a, b)
}

function internalRun(): AuthFn<Request> {
  return async (request) => {
    const secret = request.headers.get("x-internal-secret")
    const userId = request.headers.get("x-internal-user")
    const expected = process.env.LOOKOUT_RUN_SECRET
    if (!expected || !secret || !userId) return null
    if (!secretsMatch(secret, expected)) return null
    return {
      authenticator: "internal-run",
      principalType: "user",
      principalId: userId,
      attributes: {},
    }
  }
}

// Headless production evals need the same stable user principal as a signed-in
// browser, but Eve's remote runner can only send a bearer token. Keep that token
// independent from Better Auth credentials and map it to one dedicated account.
// Both values live only in the deployment environment.
function evalRun(): AuthFn<Request> {
  return async (request) => {
    const expected = process.env.EVE_EVAL_AUTH_TOKEN
    const userId = process.env.EVE_EVAL_USER_ID
    const authorization = request.headers.get("authorization")
    const prefix = "Bearer "
    if (
      !expected ||
      !userId ||
      !authorization?.startsWith(prefix) ||
      !secretsMatch(authorization.slice(prefix.length), expected)
    )
      return null

    return {
      authenticator: "eval-run",
      principalType: "user",
      principalId: userId,
      attributes: { purpose: "model-eval" },
    }
  }
}

export default eveChannel({
  // Ordered walk: our app session first, then the internal-run secret (lookouts),
  // then Vercel-to-Vercel runtime callers, then a local-dev loopback fallback.
  auth: [
    appSession(),
    internalRun(),
    evalRun(),
    vercelOidc(),
    // DEVELOPMENT ONLY. `localDev()` authenticates any request whose URL
    // hostname is loopback (127.*, localhost, [::1], *.localhost) — verified in
    // eve/channels/auth: `isLoopbackRequest(request)` reads the Host it was
    // reached on, not the client's address.
    //
    // Because this entry is last, it only fires for callers the three above
    // rejected — i.e. anonymous ones. That is harmless on Vercel, where
    // `withEve` keeps the agent same-origin and the Host is the real domain.
    //
    // It is NOT harmless self-hosted. There `withEve` rewrites /eve/v1/* to
    // http://127.0.0.1:4274, so every proxied request reaches the agent with a
    // loopback Host — and an unauthenticated request from the public internet
    // would authenticate as `local-dev` and get a full agent principal.
    // Measured: `curl -H 'Host: evil.example.com' …/eve/v1/info` → 401,
    // the same request with a loopback Host → 200.
    ...(process.env.NODE_ENV === "production" ? [] : [localDev()]),
  ],
})
