import { NextResponse } from "next/server"

import { authedWithParams, notFound } from "@/lib/api-auth"
import { ownedMcpServer } from "@/lib/api-ownership"
import { listServerTools } from "@/lib/mcp"

// POST /api/mcp/:id/test — connect to the server and list its tools.
export const POST = authedWithParams<{ id: string }>(
  async (_request, { userId, params: { id } }) => {
    const row = await ownedMcpServer(id, userId)
    if (!row) return notFound()

    try {
      const tools = await listServerTools(row)
      return NextResponse.json({ ok: true, tools: tools.map((t) => t.name) })
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          error: err instanceof Error ? err.message : "Connection failed",
        },
        { status: 200 }
      )
    }
  }
)
