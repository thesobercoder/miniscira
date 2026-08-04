import { NextResponse } from "next/server"

import { authedWithParams, notFound } from "@/lib/api-auth"
import { deleteMemory } from "@/lib/memories"

// DELETE /api/memories/:id — forget one fact. `deleteMemory` scopes the delete by
// userId inside the query, so a miss means either "no such row" or "not yours".
// Both answer 404: distinguishing them would leak whether an id exists.
export const DELETE = authedWithParams<{ id: string }>(
  async (_request, { userId, params }) => {
    const deleted = await deleteMemory(userId, params.id)
    if (!deleted) return notFound()
    return NextResponse.json({ ok: true })
  }
)
