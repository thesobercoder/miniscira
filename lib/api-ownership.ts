import { and, eq } from "drizzle-orm"

import { forbidden, notFound } from "@/lib/api-auth"
import { db } from "@/lib/db"
import { chat, lookout, mcpServer, project } from "@/lib/db/schema"

/**
 * The project, only if it belongs to this user.
 *
 * Every helper here filters on `userId` in SQL rather than loading the row and
 * comparing in JS. Both reject the same requests, but the predicate cannot be
 * deleted by accident the way a trailing `if (row.userId !== userId)` can — and
 * that `if` is the whole authorization check.
 */
export async function ownedProject(id: string, userId: string) {
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, id), eq(project.userId, userId)))
    .limit(1)
  return row ?? null
}

/** The chat, only if it belongs to this user. */
export async function ownedChat(id: string, userId: string) {
  const [row] = await db
    .select({ id: chat.id })
    .from(chat)
    .where(and(eq(chat.id, id), eq(chat.userId, userId)))
    .limit(1)
  return row ?? null
}

/**
 * The full MCP server row, only if it belongs to this user.
 *
 * The full row rather than the id: callers need the URL and the stored OAuth
 * client/tokens. Three route files each had their own copy of this query, which
 * is three chances for one of them to drop the `userId` predicate and turn into
 * an IDOR on someone else's OAuth tokens.
 */
export async function ownedMcpServer(id: string, userId: string) {
  const [row] = await db
    .select()
    .from(mcpServer)
    .where(and(eq(mcpServer.id, id), eq(mcpServer.userId, userId)))
    .limit(1)
  return row ?? null
}

/** The full lookout row, only if it belongs to this user. */
export async function ownedLookout(id: string, userId: string) {
  const [row] = await db
    .select()
    .from(lookout)
    .where(and(eq(lookout.id, id), eq(lookout.userId, userId)))
    .limit(1)
  return row ?? null
}

/**
 * The full chat row, or the rejection to return.
 *
 * Every `/api/chats/:id/*` route needs the same three steps — load, 404 if
 * missing, 403 if someone else's — and each one used to spell them out again.
 * Route auth proves *who* is asking and nothing about which rows are theirs, so
 * this check is not optional; having one implementation is what makes it
 * reviewable.
 */
export async function requireOwnedChat(
  id: string,
  userId: string
): Promise<{ chat: typeof chat.$inferSelect } | { error: Response }> {
  const [row] = await db.select().from(chat).where(eq(chat.id, id)).limit(1)
  if (!row) return { error: notFound() }
  if (row.userId !== userId) return { error: forbidden() }
  return { chat: row }
}
