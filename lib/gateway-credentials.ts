// No `import "server-only"` here, unlike its neighbours in lib/. That guard is
// a Client Component check, and eve's Rolldown bundler evaluates it as one:
// adding it fails `eve build` with "This module cannot be imported from a
// Client Component module". This file is shared between Next and the agent, so
// it cannot carry the marker — keep it out of anything with "use client".
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { userSettings } from "@/lib/db/schema"
import { gatewayBaseUrl } from "@/lib/gateway-models"
import { open } from "@/lib/secret-box"

/**
 * Whose AI Gateway credential pays for a turn.
 *
 * On this self-hosted deployment every user shares the deployment's gateway
 * (CLIProxyAPI) and, unless they saved a personal key in Settings, the
 * deployment-wide `AI_GATEWAY_API_KEY`. The shared key is only used when
 * `ALLOW_SHARED_GATEWAY_KEY=true`; with it unset, a missing user key fails
 * loudly instead of quietly landing on a pooled bill.
 */

export type GatewayCredential =
  | { kind: "user"; apiKey: string }
  | { kind: "shared"; apiKey: string }

export class NoGatewayCredentialError extends Error {
  constructor() {
    super(
      "Add your AI Gateway API key in Settings to run research. Requests are billed to your own gateway key."
    )
    this.name = "NoGatewayCredentialError"
  }
}

/** Whether falling back to the deployment's own key is permitted at all. */
function sharedKeyAllowed(): boolean {
  return process.env.ALLOW_SHARED_GATEWAY_KEY === "true"
}

/**
 * The user's saved key, or null when they have not set one.
 *
 * Deliberately not exported: the plaintext must only ever leave this module
 * inside a `GatewayCredential` handed straight to the model call. Anything that
 * wants to know *whether* a user has a key should ask `hasGatewayCredential`.
 */
async function userGatewayKey(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ cipher: userSettings.gatewayKeyCipher })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1)
  return open(row?.cipher)
}

/**
 * Resolve the credential a turn should run on.
 *
 * @throws NoGatewayCredentialError when the user has none and the shared key is
 * not permitted — which is the intended production behaviour.
 */
export async function gatewayCredentialFor(
  userId: string
): Promise<GatewayCredential> {
  const key = await userGatewayKey(userId)
  if (key) return { kind: "user", apiKey: key }

  const shared = process.env.AI_GATEWAY_API_KEY
  if (shared && sharedKeyAllowed()) return { kind: "shared", apiKey: shared }

  throw new NoGatewayCredentialError()
}

/** Whether this user can run a turn right now, for gating UI. */
export async function hasGatewayCredential(userId: string): Promise<boolean> {
  if (sharedKeyAllowed() && process.env.AI_GATEWAY_API_KEY) return true
  return (await userGatewayKey(userId)) !== null
}

/**
 * Ask the gateway whether a key works, before it is ever stored.
 *
 * `/v1/models` is a cheap authenticated read, so this costs nothing and turns
 * "paste a key and find out at your next question" into immediate feedback.
 * A network failure is reported separately from a rejection: refusing to save a
 * good key because the check could not run would be worse than saving it.
 */
export async function verifyGatewayKey(
  apiKey: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  let res: Response
  try {
    res = await fetch(`${gatewayBaseUrl()}/models`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return {
      ok: false,
      reason: "Couldn't reach the AI Gateway to check that key. Try again.",
    }
  }
  if (res.ok) return { ok: true }
  if (res.status === 401 || res.status === 403)
    return {
      ok: false,
      reason:
        "The AI Gateway rejected that key. Copy it again from your AI gateway provider.",
    }
  return { ok: false, reason: `AI Gateway returned ${res.status}.` }
}
