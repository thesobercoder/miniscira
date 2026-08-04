import { desc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { authed, notFound } from "@/lib/api-auth"
import { ownedProject } from "@/lib/api-ownership"
import { db } from "@/lib/db"
import { lookout } from "@/lib/db/schema"
import { initialNextRunAt } from "@/lib/lookout-schedule"

// GET /api/lookouts — list the signed-in user's lookouts.
export const GET = authed(async (_request, { userId }) => {
  const lookouts = await db
    .select()
    .from(lookout)
    .where(eq(lookout.userId, userId))
    .orderBy(desc(lookout.createdAt))

  return NextResponse.json({ lookouts })
})

// POST /api/lookouts — create a lookout; the in-database schedule picks it up.
export const POST = authed(async (request, { userId }) => {
  const body = (await request.json().catch(() => ({}))) as {
    name?: string
    prompt?: string
    cron?: string
    runAt?: string
    frequency?: string
    timezone?: string
    projectId?: string
  }
  const prompt = body.prompt?.trim()
  if (!prompt)
    return NextResponse.json({ error: "prompt is required" }, { status: 400 })

  const frequency =
    body.frequency === "once" ? "once" : (body.frequency ?? "daily")
  const cron = body.cron?.trim() || null
  const runAt = body.runAt ? new Date(body.runAt) : null

  if (frequency === "once") {
    if (!runAt || Number.isNaN(runAt.getTime())) {
      return NextResponse.json(
        { error: "runAt is required for a one-time lookout" },
        { status: 400 }
      )
    }
    if (runAt.getTime() < Date.now() + 60_000) {
      return NextResponse.json(
        { error: "Pick a time at least a minute in the future." },
        { status: 400 }
      )
    }
  } else if (!cron) {
    return NextResponse.json(
      { error: "cron is required for a recurring lookout" },
      { status: 400 }
    )
  }

  // Same rule as chat creation: a projectId from the body must be ours.
  if (body.projectId && !(await ownedProject(body.projectId, userId)))
    return notFound()

  const [created] = await db
    .insert(lookout)
    .values({
      userId,
      projectId: body.projectId ?? null,
      name: body.name?.trim()?.slice(0, 120) || prompt.slice(0, 60),
      prompt: prompt.slice(0, 4000),
      cron,
      runAt,
      frequency,
      timezone: body.timezone ?? "UTC",
      status: "active",
      // The dispatcher schedule (agent/schedules/lookouts.ts) fires this.
      nextRunAt: initialNextRunAt({ frequency, cron, runAt }),
    })
    .returning()

  return NextResponse.json(
    { lookout: created, scheduled: created.nextRunAt != null },
    { status: 201 }
  )
})
