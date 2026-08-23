import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { authed } from "@/lib/api-auth"
import { db } from "@/lib/db"
import { mcpServer } from "@/lib/db/schema"
import {
  finishOAuth,
  OAUTH_ATTEMPT_MAX_AGE_MS,
  serverIdFromState,
} from "@/lib/mcp-oauth"
import { openMcpSecret } from "@/lib/mcp-secrets"
import { sameCallbackTarget } from "@/lib/mcp-url"

const safeError = (error: string, status = 400) =>
  NextResponse.json({ error }, { status })

async function clearAttempt(serverId: string) {
  await db
    .update(mcpServer)
    .set({
      oauthVerifier: null,
      oauthState: null,
      oauthAttemptCallbackUrl: null,
      oauthAttemptStartedAt: null,
    })
    .where(eq(mcpServer.id, serverId))
}

export const POST = authed(async (request, { userId }) => {
  const body = (await request.json().catch(() => ({}))) as {
    callbackUrl?: string
  }
  let callback: URL
  try {
    callback = new URL(body.callbackUrl ?? "")
  } catch {
    return safeError("Paste the complete callback URL from the browser.")
  }

  const state = callback.searchParams.get("state")
  if (!state) return safeError("The callback URL is missing OAuth state.")
  const serverId = serverIdFromState(state)
  if (!serverId) return safeError("The callback URL has invalid OAuth state.")

  const [row] = await db
    .select()
    .from(mcpServer)
    .where(eq(mcpServer.id, serverId))
    .limit(1)
  if (!row || row.userId !== userId)
    return safeError("This OAuth attempt does not belong to your account.", 403)
  if (
    row.oauthCallbackMode !== "manual" ||
    !row.oauthAttemptCallbackUrl ||
    !sameCallbackTarget(row.oauthAttemptCallbackUrl, callback)
  )
    return safeError("The callback URL does not match this OAuth attempt.")
  if (
    !row.oauthAttemptStartedAt ||
    Date.now() - row.oauthAttemptStartedAt.getTime() > OAUTH_ATTEMPT_MAX_AGE_MS
  ) {
    await clearAttempt(row.id)
    return safeError("This OAuth attempt expired. Start Connect again.")
  }
  if (!row.oauthState || openMcpSecret(row.oauthState) !== state)
    return safeError("This OAuth callback was already used or does not match.")

  if (callback.searchParams.get("error")) {
    await clearAttempt(row.id)
    return safeError("The authorization server rejected the request.")
  }
  const code = callback.searchParams.get("code")
  if (!code)
    return safeError("The callback URL is missing the authorization code.")

  try {
    await finishOAuth(row, code, state)
    return NextResponse.json({ serverId: row.id, connected: true })
  } catch {
    await clearAttempt(row.id)
    console.error("mcp oauth manual token exchange failed", {
      serverId: row.id,
    })
    return safeError("The OAuth token exchange failed. Start Connect again.")
  }
})
