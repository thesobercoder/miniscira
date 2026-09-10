import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { authedWithParams, notFound } from "@/lib/api-auth"
import { ownedMcpServer } from "@/lib/api-ownership"
import { db } from "@/lib/db"
import { mcpServer } from "@/lib/db/schema"
import { publicServer } from "@/lib/mcp"
import { sealMcpJson, updatedMcpOAuthClient } from "@/lib/mcp-secrets"

type Params = { id: string }

// PATCH /api/mcp/:id — rename or enable/disable.
export const PATCH = authedWithParams<Params>(
  async (request, { userId, params: { id } }) => {
    const row = await ownedMcpServer(id, userId)
    if (!row) return notFound()

    const body = (await request.json().catch(() => ({}))) as {
      name?: string
      enabled?: boolean
      oauthClientId?: string
      oauthClientSecret?: string
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() }
    if (typeof body.name === "string" && body.name.trim())
      patch.name = body.name.trim().slice(0, 80)
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled
    if (typeof body.oauthClientId === "string") {
      const clientId = body.oauthClientId.trim()
      const clientSecret = body.oauthClientSecret?.trim()
      const client = updatedMcpOAuthClient(
        row.oauthClient,
        clientId,
        clientSecret
      )
      patch.oauthClient = sealMcpJson(client)
      patch.oauthTokens = null
      patch.oauthVerifier = null
      patch.oauthState = null
    }

    const [updated] = await db
      .update(mcpServer)
      .set(patch)
      .where(eq(mcpServer.id, id))
      .returning()
    return NextResponse.json({ server: publicServer(updated) })
  }
)

// DELETE /api/mcp/:id
export const DELETE = authedWithParams<Params>(
  async (_request, { userId, params: { id } }) => {
    const row = await ownedMcpServer(id, userId)
    if (!row) return notFound()

    await db
      .delete(mcpServer)
      .where(and(eq(mcpServer.id, id), eq(mcpServer.userId, userId)))
    return NextResponse.json({ ok: true })
  }
)
