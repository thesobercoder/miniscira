import { asc, eq } from "drizzle-orm"
import type { SessionState } from "eve/client"
import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { ResearchChat } from "@/components/research-chat"
import { auth } from "@/lib/auth"
import type { ChatEvent } from "@/lib/chat-events"
import { db } from "@/lib/db"
import { chat, chatEvent, project } from "@/lib/db/schema"

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const [row] = await db.select().from(chat).where(eq(chat.id, id)).limit(1)
  if (!row) notFound()
  if (row.userId !== session.user.id) redirect("/")

  const events = await db
    .select({ event: chatEvent.event })
    .from(chatEvent)
    .where(eq(chatEvent.chatId, id))
    .orderBy(asc(chatEvent.seq))

  const [proj] = row.projectId
    ? await db
        .select({
          id: project.id,
          instructions: project.instructions,
          links: project.links,
        })
        .from(project)
        .where(eq(project.id, row.projectId))
        .limit(1)
    : []

  const initialSession: SessionState | undefined = row.eveSessionId
    ? {
        sessionId: row.eveSessionId,
        continuationToken: row.continuationToken ?? undefined,
        streamIndex: row.streamIndex,
      }
    : undefined

  return (
    <ResearchChat
      key={id}
      chatId={id}
      initialEvents={events.map((e) => e.event) as ChatEvent[]}
      initialSession={initialSession}
      projectId={row.projectId ?? undefined}
      projectInstructions={proj?.instructions ?? undefined}
      projectLinks={proj?.links ?? undefined}
    />
  )
}
