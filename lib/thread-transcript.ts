import { and, asc, eq } from "drizzle-orm"
import { defaultMessageReducer, type EveMessage } from "eve/client"

import {
  asEveEvent,
  type ChatEvent,
  isSupersedeEvent,
  partText,
  scopeSessions,
} from "@/lib/chat-events"
import { db } from "@/lib/db"
import { chat, chatEvent } from "@/lib/db/schema"

export const THREAD_READ_EVENT_LIMIT = 10_000
export const THREAD_READ_MESSAGE_LIMIT = 100
export const THREAD_READ_CHARACTER_LIMIT = 30_000

export type VisibleThreadMessage = {
  id: string
  role: "user" | "assistant"
  text: string
  truncated?: boolean
}

export function projectVisibleThreadMessages(
  events: readonly ChatEvent[]
): VisibleThreadMessage[] {
  const scoped = scopeSessions(events)
  const superseded = new Set<string>()
  for (const event of scoped.events) {
    if (!isSupersedeEvent(event)) continue
    for (const id of event.ids) superseded.add(id)
  }

  const reducer = defaultMessageReducer()
  let data = reducer.initial()
  for (const event of scoped.events) {
    if (isSupersedeEvent(event)) continue
    data = reducer.reduce(data, asEveEvent(event))
  }

  return data.messages.flatMap((message: EveMessage) => {
    if (superseded.has(message.id)) return []
    // An interrupted turn may already have streamed text into the reducer. It
    // is visible in the live UI with a failure annotation, but it is not a
    // completed historical answer and must not become continuity evidence.
    if (message.role === "assistant" && message.metadata?.status !== "complete")
      return []
    const text = partText(message.parts, "text").trim()
    return text ? [{ id: message.id, role: message.role, text }] : []
  })
}

export function boundVisibleThreadMessages(
  messages: readonly VisibleThreadMessage[],
  before: number | null = null
) {
  const end =
    before === null ? messages.length : Math.min(before, messages.length)
  const start = Math.max(0, end - THREAD_READ_MESSAGE_LIMIT)
  const selected = messages.slice(start, end)

  const bounded: VisibleThreadMessage[] = []
  let characters = 0
  for (let index = selected.length - 1; index >= 0; index--) {
    const message = selected[index]
    const remaining = THREAD_READ_CHARACTER_LIMIT - characters
    if (remaining <= 0) break
    const truncated = message.text.length > remaining
    const text = truncated ? message.text.slice(0, remaining) : message.text
    bounded.unshift({ ...message, text, ...(truncated && { truncated: true }) })
    characters += text.length
  }

  return {
    messages: bounded,
    nextBefore: start > 0 ? start : null,
    truncated: start > 0 || bounded.length < selected.length,
  }
}

export async function readVisibleThread({
  chatId,
  userId,
  projectId,
  before = null,
}: {
  chatId: string
  userId: string
  projectId: string | null
  before?: number | null
}) {
  const [owned] = await db
    .select({ id: chat.id, title: chat.title, projectId: chat.projectId })
    .from(chat)
    .where(
      and(
        eq(chat.id, chatId),
        eq(chat.userId, userId),
        projectId ? eq(chat.projectId, projectId) : undefined
      )
    )
    .limit(1)
  if (!owned) return null

  const rows = await db
    .select({ event: chatEvent.event })
    .from(chatEvent)
    .where(eq(chatEvent.chatId, chatId))
    .orderBy(asc(chatEvent.seq))
    .limit(THREAD_READ_EVENT_LIMIT + 1)
  if (rows.length > THREAD_READ_EVENT_LIMIT) {
    return { ...owned, error: "Thread is too large to read safely." as const }
  }
  const visible = projectVisibleThreadMessages(
    rows.map((row) => row.event as ChatEvent)
  )
  return { ...owned, ...boundVisibleThreadMessages(visible, before) }
}
