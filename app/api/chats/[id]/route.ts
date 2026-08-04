import { and, asc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { authedWithParams } from "@/lib/api-auth"
import { requireOwnedChat } from "@/lib/api-ownership"
import { db } from "@/lib/db"
import { chat, chatEvent } from "@/lib/db/schema"

type Params = { id: string }

// GET /api/chats/:id — chat metadata, session cursor, and ordered events.
export const GET = authedWithParams<Params>(
  async (_request, { userId, params: { id } }) => {
    const owned = await requireOwnedChat(id, userId)
    if ("error" in owned) return owned.error

    const events = await db
      .select({ seq: chatEvent.seq, event: chatEvent.event })
      .from(chatEvent)
      .where(eq(chatEvent.chatId, id))
      .orderBy(asc(chatEvent.seq))

    return NextResponse.json({
      chat: {
        id: owned.chat.id,
        title: owned.chat.title,
        eveSessionId: owned.chat.eveSessionId,
        continuationToken: owned.chat.continuationToken,
        streamIndex: owned.chat.streamIndex,
      },
      events: events.map((e) => e.event),
    })
  }
)

// PATCH /api/chats/:id — update title and/or the eve session cursor.
export const PATCH = authedWithParams<Params>(
  async (request, { userId, params: { id } }) => {
    const owned = await requireOwnedChat(id, userId)
    if ("error" in owned) return owned.error

    const body = (await request.json().catch(() => ({}))) as {
      title?: string
      eveSessionId?: string | null
      continuationToken?: string | null
      streamIndex?: number
    }

    const update: Partial<typeof chat.$inferInsert> = { updatedAt: new Date() }
    if (typeof body.title === "string") update.title = body.title.slice(0, 200)
    // Explicit null clears the cursor — that's how the client drops a session it
    // found to be gone, so a reload doesn't rediscover the same dead id. Omitting
    // the key still leaves the column alone.
    if (body.eveSessionId !== undefined)
      update.eveSessionId = body.eveSessionId ?? null
    if (body.continuationToken !== undefined)
      update.continuationToken = body.continuationToken ?? null
    if (typeof body.streamIndex === "number")
      update.streamIndex = body.streamIndex

    await db.update(chat).set(update).where(eq(chat.id, id))

    return NextResponse.json({ ok: true })
  },
  // Unmetered for the same reason as the events route: this is the cursor
  // PATCH, driven by the turn lifecycle rather than by the user, and losing it
  // to a 429 leaves a reload unable to re-attach to an in-flight turn.
  { metered: false }
)

// DELETE /api/chats/:id — remove the chat (events cascade).
export const DELETE = authedWithParams<Params>(
  async (_request, { userId, params: { id } }) => {
    const owned = await requireOwnedChat(id, userId)
    if ("error" in owned) return owned.error

    await db.delete(chat).where(and(eq(chat.id, id), eq(chat.userId, userId)))

    return NextResponse.json({ ok: true })
  }
)
