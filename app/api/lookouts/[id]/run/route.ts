import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { authedWithParams, notFound } from "@/lib/api-auth"
import { db } from "@/lib/db"
import { lookout } from "@/lib/db/schema"
import { runLookout } from "@/lib/lookout-runner"
import { leaseLookout, releaseLookoutLease } from "@/lib/lookout-schedule"

// Long-running research turn — allow up to 5 minutes on Vercel.
export const maxDuration = 300

// POST /api/lookouts/:id/run — manually trigger a lookout ("Run now").
export const POST = authedWithParams<{ id: string }>(
  async (_request, { userId, params: { id } }) => {
    const [row] = await db
      .select()
      .from(lookout)
      .where(eq(lookout.id, id))
      .limit(1)
    if (!row || row.userId !== userId) return notFound()

    // Take the same lease the scheduler uses, so a manual run and a scheduled
    // dispatch of the same lookout can never both enter runLookout.
    const leased = await leaseLookout(id, new Date())
    if (!leased) {
      return NextResponse.json(
        { error: "This lookout is already running." },
        { status: 409 }
      )
    }

    try {
      const result = await runLookout(id)
      if (!result.ok) return NextResponse.json(result, { status: 500 })
      return NextResponse.json(result)
    } finally {
      // Drop the lease without advancing nextRunAt — a manual run must not
      // shift the user's next automatic run.
      await releaseLookoutLease(id)
    }
  }
)
