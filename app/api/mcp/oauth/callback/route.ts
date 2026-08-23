import { eq } from "drizzle-orm"
import { type NextRequest, NextResponse } from "next/server"

import { auth as betterAuth } from "@/lib/auth"
import { db } from "@/lib/db"
import { mcpServer } from "@/lib/db/schema"
import {
  clearOAuthAttempt,
  finishOAuth,
  oauthAttemptIsActive,
  serverIdFromState,
} from "@/lib/mcp-oauth"
import { openMcpSecret } from "@/lib/mcp-secrets"

function callbackPage(status: "success" | "error", message: string) {
  const title = status === "success" ? "MCP connected" : "MCP connection failed"
  const script = `
    try {
      const channel = new BroadcastChannel("miniscira-mcp-oauth");
      channel.postMessage({ type: "mcp-oauth", status: ${JSON.stringify(status)} });
      channel.close();
    } catch {}
    if (${JSON.stringify(status)} === "success") setTimeout(() => window.close(), 500);
  `
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title></head><body><main><h1>${title}</h1><p>${message}</p><p>You can close this tab.</p></main><script>${script}</script></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  )
}

// GET /api/mcp/oauth/callback — the OAuth redirect URI for every MCP server.
// The state parameter carries the server id; tokens are exchanged and stored,
// then the user lands back on the MCP servers page.
export async function GET(request: NextRequest) {
  const session = await betterAuth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.redirect(new URL("/sign-in", request.url))

  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
  const oauthError = request.nextUrl.searchParams.get("error")
  if (!state)
    return callbackPage("error", "The callback was missing required values.")

  const serverId = serverIdFromState(state)
  if (!serverId) return callbackPage("error", "The callback state was invalid.")

  const [row] = await db
    .select()
    .from(mcpServer)
    .where(eq(mcpServer.id, serverId))
    .limit(1)
  if (!row || row.userId !== session.user.id)
    return callbackPage("error", "This MCP connection was not found.")
  if (!row.oauthState || openMcpSecret(row.oauthState) !== state)
    return callbackPage(
      "error",
      "This callback did not match the connection attempt."
    )
  const expectedCallback = new URL("/api/mcp/oauth/callback", request.url)
  if (
    row.oauthCallbackMode !== "automatic" ||
    !row.oauthAttemptCallbackUrl ||
    row.oauthAttemptCallbackUrl !== expectedCallback.toString() ||
    !oauthAttemptIsActive(row.oauthAttemptStartedAt)
  ) {
    await clearOAuthAttempt(row.id, true)
    return callbackPage("error", "This connection attempt expired or changed.")
  }
  if (oauthError) {
    await clearOAuthAttempt(row.id, true)
    return callbackPage("error", "Authorization was rejected.")
  }
  if (!code) {
    await clearOAuthAttempt(row.id, true)
    return callbackPage("error", "The callback was missing required values.")
  }

  try {
    await finishOAuth(row, code, state)
    return callbackPage("success", "The MCP server is ready to use.")
  } catch {
    console.error("mcp oauth token exchange failed", { serverId: row.id })
    return callbackPage(
      "error",
      "The token exchange failed. Start Connect again."
    )
  }
}
