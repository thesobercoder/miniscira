import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { authedWithParams, notFound } from "@/lib/api-auth"
import { ownedMcpServer } from "@/lib/api-ownership"
import { db } from "@/lib/db"
import { mcpServer } from "@/lib/db/schema"
import { publicServer } from "@/lib/mcp"
import { sealMcpJson, updatedMcpOAuthClient } from "@/lib/mcp-secrets"
import { validateMcpCallbackUrl } from "@/lib/mcp-url"

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
      oauthCallbackMode?: string
      oauthCallbackUrl?: string
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() }
    if (typeof body.name === "string" && body.name.trim())
      patch.name = body.name.trim().slice(0, 80)
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled
    if (typeof body.oauthCallbackMode === "string") {
      const mode = body.oauthCallbackMode === "manual" ? "manual" : "automatic"
      const callbackUrl =
        body.oauthCallbackUrl === undefined
          ? row.oauthCallbackUrl
          : body.oauthCallbackUrl.trim() || null
      if (mode === "manual") {
        if (!callbackUrl)
          return NextResponse.json(
            { error: "OAuth callback URL is required in manual mode." },
            { status: 400 }
          )
        const parsed = validateMcpCallbackUrl(callbackUrl)
        if (!parsed.ok)
          return NextResponse.json({ error: parsed.error }, { status: 400 })
      }
      const changed =
        mode !== row.oauthCallbackMode ||
        (mode === "manual" && callbackUrl !== row.oauthCallbackUrl)
      patch.oauthCallbackMode = mode
      patch.oauthCallbackUrl = mode === "manual" ? callbackUrl : null
      if (changed) {
        patch.oauthClient = null
        patch.oauthTokens = null
        patch.oauthVerifier = null
        patch.oauthState = null
        patch.oauthAttemptCallbackUrl = null
        patch.oauthAttemptStartedAt = null
      }
    }
    const callbackChanged =
      patch.oauthCallbackMode !== undefined &&
      (patch.oauthClient === null ||
        patch.oauthCallbackMode !== row.oauthCallbackMode ||
        patch.oauthCallbackUrl !== row.oauthCallbackUrl)
    if (typeof body.oauthClientId === "string" && !callbackChanged) {
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
      patch.oauthAttemptCallbackUrl = null
      patch.oauthAttemptStartedAt = null
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
