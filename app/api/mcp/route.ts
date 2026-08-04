import { desc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { authed } from "@/lib/api-auth"
import { db } from "@/lib/db"
import { mcpServer } from "@/lib/db/schema"
import { publicServer } from "@/lib/mcp"

function sanitizeHeaders(input: unknown): Record<string, string> | null {
  if (!input || typeof input !== "object") return null
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (k.trim() && typeof v === "string") out[k.trim()] = v
  }
  return Object.keys(out).length > 0 ? out : null
}

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
  }
  const name = body.name?.trim()
  const url = body.url?.trim()
  const transport = body.transport === "sse" ? "sse" : "http"

  if (!name || !url)
    return NextResponse.json(
      { error: "name and url are required" },
      { status: 400 }
    )
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json(
      { error: "url is not a valid URL" },
      { status: 400 }
    )
  }
  if (
    parsed.protocol !== "https:" &&
    parsed.hostname !== "localhost" &&
    parsed.hostname !== "127.0.0.1"
  ) {
    return NextResponse.json(
      { error: "Only https:// URLs are allowed (or localhost for dev)." },
      { status: 400 }
    )
  }

  const [created] = await db
    .insert(mcpServer)
    .values({
      userId,
      name: name.slice(0, 80),
      url,
      transport,
      headers: sanitizeHeaders(body.headers),
    })
    .returning()

  return NextResponse.json({ server: publicServer(created) }, { status: 201 })
})
