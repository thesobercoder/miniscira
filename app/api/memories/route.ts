import { NextResponse } from "next/server"

import { authed } from "@/lib/api-auth"
import { listMemories } from "@/lib/memories"

// GET /api/memories — the durable facts the agent has learned about the signed-in
// user, the same rows it injects into every turn. Read-only on purpose: memories
// are written by the agent's `remember` tool, and removed via DELETE /:id.
export const GET = authed(async (_request, { userId }) =>
  NextResponse.json({ memories: await listMemories(userId) })
)
