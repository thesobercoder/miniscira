import { desc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { authed } from "@/lib/api-auth"
import { db } from "@/lib/db"
import { mcpServer } from "@/lib/db/schema"
import { publicServer } from "@/lib/mcp"
import { sanitizeMcpHeaders, validateMcpHeaders } from "@/lib/mcp-headers"
import { sealMcpHeaders, sealMcpJson } from "@/lib/mcp-secrets"
import { validateMcpServerUrl } from "@/lib/mcp-url"

// GET /api/mcp — the signed-in user's MCP servers.
export const GET = authed(async (_request, { userId }) => {
  const servers = await db
    .select()
    .from(mcpServer)
    .where(eq(mcpServer.userId, userId))
    .orderBy(desc(mcpServer.createdAt))

  return NextResponse.json({ servers: servers.map(publicServer) })
})

// POST /api/mcp — add a server (HTTP or SSE transport only).
export const POST = authed(async (request, { userId }) => {
  const body = (await request.json().catch(() => ({}))) as {
    name?: string
    url?: string
    transport?: string
    headers?: unknown
    oauthClientId?: string
    oauthClientSecret?: string
    authType?: string
  }
  const name = body.name?.trim()
  const url = body.url?.trim()
  const transport = body.transport === "sse" ? "sse" : "http"
  const oauthClientId = body.oauthClientId?.trim()
  const oauthClientSecret = body.oauthClientSecret?.trim()
  const authType = ["none", "header", "oauth"].includes(body.authType ?? "")
    ? body.authType
    : "auto"
  const headers = sanitizeMcpHeaders(body.headers)

  if (!name || !url)
    return NextResponse.json(
      { error: "name and url are required" },
      { status: 400 }
    )
  const parsed = validateMcpServerUrl(url)
  if (!parsed.ok)
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  const headerError = validateMcpHeaders(headers, {
    required: authType === "header",
  })
  if (headerError)
    return NextResponse.json({ error: headerError }, { status: 400 })

  const [created] = await db
    .insert(mcpServer)
    .values({
      userId,
      name: name.slice(0, 80),
      url,
      transport,
      authType,
      headers: sealMcpHeaders(headers),
      oauthClient: oauthClientId
        ? sealMcpJson({
            client_id: oauthClientId,
            ...(oauthClientSecret ? { client_secret: oauthClientSecret } : {}),
          })
        : null,
    })
    .returning()

  return NextResponse.json(
    {
      server: {
        ...publicServer(created),
        offersOAuth:
          created.authType === "oauth" || created.oauthClient != null,
      },
    },
    { status: 201 }
  )
})
