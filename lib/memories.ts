import { and, asc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { memory } from "@/lib/db/schema"

const MAX_MEMORIES_PER_USER = 100
const MAX_MEMORY_CHARS = 500

export async function listMemories(userId: string) {
  return db
    .select()
    .from(memory)
    .where(eq(memory.userId, userId))
    .orderBy(asc(memory.createdAt))
}

export async function saveMemory(userId: string, content: string) {
  const trimmed = content.trim().slice(0, MAX_MEMORY_CHARS)
  if (!trimmed) throw new Error("Memory content is empty.")
  const existing = await listMemories(userId)
  if (existing.length >= MAX_MEMORIES_PER_USER) {
    throw new Error(
      `Memory limit reached (${MAX_MEMORIES_PER_USER}). Forget something first.`
    )
  }
  const [row] = await db
    .insert(memory)
    .values({ userId, content: trimmed })
    .returning()
  return row
}

export async function deleteMemory(userId: string, id: string) {
  const deleted = await db
    .delete(memory)
    .where(and(eq(memory.id, id), eq(memory.userId, userId)))
    .returning({ id: memory.id })
  return deleted.length > 0
}
