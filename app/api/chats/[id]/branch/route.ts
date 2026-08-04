import { asc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { authedWithParams } from "@/lib/api-auth"
import { requireOwnedChat } from "@/lib/api-ownership"
import { db } from "@/lib/db"
import { chat, chatEvent } from "@/lib/db/schema"

// POST /api/chats/:id/branch — fork the conversation into a new chat.
// Copies the event history for display only. The eve session cursor is NOT
// copied: a durable session has exactly one active continuation token, so two
// chats sharing it would invalidate each other (the second send is rejected).
// The branch starts a fresh session on its next message; the client seeds it
// with a recap of the visible conversation.
export const POST = authedWithParams<{ id: string }>(
  async (_request, { userId, params: { id } }) => {
    const owned = await requireOwnedChat(id, userId)
    if ("error" in owned) return owned.error
    const row = owned.chat

    const events = await db
      .select({ seq: chatEvent.seq, event: chatEvent.event })
      .from(chatEvent)
      .where(eq(chatEvent.chatId, id))
      .orderBy(asc(chatEvent.seq))

    const [branched] = await db
      .insert(chat)
      .values({
        userId: row.userId,
        projectId: row.projectId,
        title: `${row.title} (branch)`.slice(0, 200),
      })
      .returning()

    if (events.length > 0) {
      await db.insert(chatEvent).values(
        events.map((e) => ({
          chatId: branched.id,
          seq: e.seq,
          event: e.event,
        }))
      )
    }

    return NextResponse.json(
      { chat: { id: branched.id, title: branched.title } },
      { status: 201 }
    )
  }
)
