import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { authedWithParams, notFound } from "@/lib/api-auth"
import { ownedMcpServer } from "@/lib/api-ownership"
import { db } from "@/lib/db"
import { mcpServer } from "@/lib/db/schema"
import { startOAuth } from "@/lib/mcp-oauth"

type Params = { id: string }

// POST /api/mcp/:id/auth — begin the OAuth flow. Returns the authorization URL
// to redirect the browser to (or authorized:true when tokens already work).
export const POST = authedWithParams<Params>(
  async (_request, { userId, params: { id } }) => {
    const row = await ownedMcpServer(id, userId)
    if (!row) return notFound()

    try {
      const result = await startOAuth(row)
      if (result.status === "authorized")
        return NextResponse.json({ authorized: true })
      return NextResponse.json({ authorized: false, url: result.url })
    } catch (err) {
      const message = err instanceof Error ? err.message : "OAuth start failed"
      return NextResponse.json(
        {
          error: message,
          needsClient:
            !row.oauthClient &&
            /registration|register|client information/i.test(message),
        },
        { status: 400 }
      )
    }
  }
)

// DELETE /api/mcp/:id/auth — disconnect: drop tokens + registered client.
export const DELETE = authedWithParams<Params>(
  async (_request, { userId, params: { id } }) => {
    const row = await ownedMcpServer(id, userId)
    if (!row) return notFound()

    await db
      .update(mcpServer)
      .set({
        oauthClient: null,
        oauthTokens: null,
        oauthVerifier: null,
        oauthState: null,
      })
      .where(eq(mcpServer.id, id))
    return NextResponse.json({ ok: true })
  }
)
