import { eq } from "drizzle-orm"
import { type NextRequest, NextResponse } from "next/server"

import { auth as betterAuth } from "@/lib/auth"
import { db } from "@/lib/db"
import { mcpServer } from "@/lib/db/schema"
import { finishOAuth, serverIdFromState } from "@/lib/mcp-oauth"
import { openMcpSecret } from "@/lib/mcp-secrets"

// GET /api/mcp/oauth/callback — the OAuth redirect URI for every MCP server.
// The state parameter carries the server id; tokens are exchanged and stored,
// then the user lands back on the MCP servers page.
export async function GET(request: NextRequest) {
  const back = (query: string) =>
    NextResponse.redirect(new URL(`/mcps?${query}`, request.url))

  const session = await betterAuth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.redirect(new URL("/sign-in", request.url))

  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
  const oauthError = request.nextUrl.searchParams.get("error")
  if (oauthError) return back(`auth_error=${encodeURIComponent(oauthError)}`)
  if (!code || !state) return back("auth_error=missing_code_or_state")

  const serverId = serverIdFromState(state)
  if (!serverId) return back("auth_error=bad_state")

  const [row] = await db
    .select()
    .from(mcpServer)
    .where(eq(mcpServer.id, serverId))
    .limit(1)
  if (!row || row.userId !== session.user.id)
    return back("auth_error=unknown_server")
  if (!row.oauthState || openMcpSecret(row.oauthState) !== state)
    return back("auth_error=state_mismatch")

  try {
    await finishOAuth(row, code, state)
    return back(`connected=${encodeURIComponent(row.name)}`)
  } catch (err) {
    console.error("mcp oauth token exchange failed")
    return back(
      `auth_error=${encodeURIComponent(err instanceof Error ? err.message : "token_exchange_failed")}`
    )
  }
}
