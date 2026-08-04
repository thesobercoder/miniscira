import { desc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { authed } from "@/lib/api-auth"
import { db } from "@/lib/db"
import { project } from "@/lib/db/schema"

// GET /api/projects — list the signed-in user's projects.
export const GET = authed(async (_request, { userId }) => {
  const projects = await db
    .select({
      id: project.id,
      name: project.name,
      instructions: project.instructions,
      updatedAt: project.updatedAt,
    })
    .from(project)
    .where(eq(project.userId, userId))
    .orderBy(desc(project.updatedAt))

  return NextResponse.json({ projects })
})

// POST /api/projects — create a project.
export const POST = authed(async (request, { userId }) => {
  const body = (await request.json().catch(() => ({}))) as {
    name?: string
    instructions?: string
  }

  const [created] = await db
    .insert(project)
    .values({
      userId,
      name: body.name?.slice(0, 120) || "Untitled project",
      instructions: body.instructions?.slice(0, 8000) || null,
    })
    .returning()

  return NextResponse.json({ project: created }, { status: 201 })
})
