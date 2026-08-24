import { NextResponse } from "next/server"

import { authed, notFound } from "@/lib/api-auth"
import { ownedProject } from "@/lib/api-ownership"
import { db } from "@/lib/db"
import { chat } from "@/lib/db/schema"
import { isInvalidHistoryCursor, listHistoryPage } from "@/lib/history"

// GET /api/chats — one bounded active-history page.
export const GET = authed(async (request, { userId }) => {
  const cursor = request.nextUrl.searchParams.get("cursor")
  try {
    const page = await listHistoryPage({
      userId,
      scope: { kind: "active" },
      cursor,
    })
    return NextResponse.json({
      chats: page.rows.map((row) => ({
        id: row.id,
        title: row.title,
        updatedAt: row.timestamp.toISOString(),
      })),
      nextCursor: page.nextCursor,
    })
  } catch (error) {
    if (!isInvalidHistoryCursor(error)) throw error
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 })
  }
})

// POST /api/chats — create an empty chat row and return its id.
export const POST = authed(async (request, { userId }) => {
  const body = (await request.json().catch(() => ({}))) as {
    title?: string
    projectId?: string
  }

  // A projectId arriving in the body is not automatically ours — verify it
  // belongs to this user before linking the chat to it. 404, not 403, so the
  // caller cannot probe for the existence of other tenants' projects.
  if (body.projectId) {
    const parent = await ownedProject(body.projectId, userId)
    if (!parent) return notFound()
  }

  const [created] = await db
    .insert(chat)
    .values({
      userId,
      title: body.title?.slice(0, 200) || "New research",
      projectId: body.projectId ?? null,
    })
    .returning({ id: chat.id, title: chat.title, createdAt: chat.createdAt })

  return NextResponse.json({ chat: created }, { status: 201 })
})
