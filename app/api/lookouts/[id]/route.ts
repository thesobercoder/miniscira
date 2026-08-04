import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { authedWithParams, notFound } from "@/lib/api-auth"
import { ownedLookout } from "@/lib/api-ownership"
import { db } from "@/lib/db"
import { lookout } from "@/lib/db/schema"
import { initialNextRunAt } from "@/lib/lookout-schedule"

type Params = { id: string }

// PATCH /api/lookouts/:id — pause/resume or rename. The dispatcher schedule
// only claims active rows, so pausing is just a status flip; resuming
// recomputes the next slot (a one-time lookout re-arms only if still future).
export const PATCH = authedWithParams<Params>(
  async (request, { userId, params: { id } }) => {
    const row = await ownedLookout(id, userId)
    if (!row) return notFound()

    const body = (await request.json().catch(() => ({}))) as {
      status?: string
      name?: string
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() }
    if (typeof body.name === "string")
      patch.name = body.name.slice(0, 120) || row.name

    if (body.status === "paused" && row.status === "active") {
      patch.status = "paused"
      patch.leasedUntil = null
    } else if (body.status === "active" && row.status !== "active") {
      patch.status = "active"
      const next = initialNextRunAt(row)
      // A one-time lookout whose moment has passed stays manual-only.
      patch.nextRunAt =
        row.frequency === "once" &&
        next &&
        next.getTime() <= Date.now() + 60_000
          ? null
          : next
    }

    const [updated] = await db
      .update(lookout)
      .set(patch)
      .where(eq(lookout.id, id))
      .returning()
    return NextResponse.json({ lookout: updated })
  }
)

// DELETE /api/lookouts/:id — remove the lookout (nothing external to cancel).
export const DELETE = authedWithParams<Params>(
  async (_request, { userId, params: { id } }) => {
    const row = await ownedLookout(id, userId)
    if (!row) return notFound()

    await db
      .delete(lookout)
      .where(and(eq(lookout.id, id), eq(lookout.userId, userId)))
    return NextResponse.json({ ok: true })
  }
)
