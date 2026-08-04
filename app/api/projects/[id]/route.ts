import { and, desc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { authedWithParams, notFound } from "@/lib/api-auth"
import { ownedProject } from "@/lib/api-ownership"
import { db } from "@/lib/db"
import { chat, document, project } from "@/lib/db/schema"

type Params = { id: string }

// GET /api/projects/:id — the project plus its chats and documents.
export const GET = authedWithParams<Params>(
  async (_request, { userId, params: { id } }) => {
    const row = await ownedProject(id, userId)
    if (!row) return notFound()

    const [chats, docs] = await Promise.all([
      db
        .select({ id: chat.id, title: chat.title, updatedAt: chat.updatedAt })
        .from(chat)
        .where(and(eq(chat.projectId, id), eq(chat.userId, userId)))
        .orderBy(desc(chat.updatedAt)),
      db
        .select({
          id: document.id,
          kind: document.kind,
          filename: document.filename,
          status: document.status,
          // Why it failed, not just that it did. The upload toast is gone by
          // the next page load, so this is the only place a user can find out
          // that a document is not searchable and what to do about it.
          error: document.error,
          url: document.blobUrl,
        })
        .from(document)
        .where(and(eq(document.projectId, id), eq(document.userId, userId)))
        .orderBy(desc(document.createdAt)),
    ])

    return NextResponse.json({ project: row, chats, documents: docs })
  }
)

// PATCH /api/projects/:id — rename or update instructions.
export const PATCH = authedWithParams<Params>(
  async (request, { userId, params: { id } }) => {
    const row = await ownedProject(id, userId)
    if (!row) return notFound()

    const body = (await request.json().catch(() => ({}))) as {
      name?: string
      instructions?: string
      links?: unknown
    }
    const patch: {
      name?: string
      instructions?: string | null
      links?: string[] | null
      updatedAt: Date
    } = {
      updatedAt: new Date(),
    }
    if (typeof body.name === "string")
      patch.name = body.name.slice(0, 120) || "Untitled project"
    if (typeof body.instructions === "string")
      patch.instructions = body.instructions.slice(0, 8000) || null
    if (Array.isArray(body.links)) {
      const links = body.links
        .filter((l): l is string => typeof l === "string")
        .map((l) => l.trim())
        .filter((l) => {
          try {
            const u = new URL(l)
            return u.protocol === "https:" || u.protocol === "http:"
          } catch {
            return false
          }
        })
        .slice(0, 50)
      patch.links = links.length > 0 ? [...new Set(links)] : null
    }

    const [updated] = await db
      .update(project)
      .set(patch)
      .where(eq(project.id, id))
      .returning()
    return NextResponse.json({ project: updated })
  }
)

// DELETE /api/projects/:id — remove the project (chats/docs keep, unlinked).
export const DELETE = authedWithParams<Params>(
  async (_request, { userId, params: { id } }) => {
    const row = await ownedProject(id, userId)
    if (!row) return notFound()

    await db
      .delete(project)
      .where(and(eq(project.id, id), eq(project.userId, userId)))
    return NextResponse.json({ ok: true })
  }
)
