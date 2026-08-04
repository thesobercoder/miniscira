import { del } from "@vercel/blob"
import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { authedWithParams, forbidden, notFound } from "@/lib/api-auth"
import { db } from "@/lib/db"
import { document } from "@/lib/db/schema"

// DELETE /api/documents/:id — remove a document, its chunks (cascade), and the blob.
export const DELETE = authedWithParams<{ id: string }>(
  async (_request, { userId, params: { id } }) => {
    const [row] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .limit(1)
    if (!row) return notFound()
    if (row.userId !== userId) return forbidden()

    await del(row.blobUrl).catch((err) =>
      console.error("blob delete failed", err)
    )
    await db
      .delete(document)
      .where(and(eq(document.id, id), eq(document.userId, userId)))

    return NextResponse.json({ ok: true })
  }
)
