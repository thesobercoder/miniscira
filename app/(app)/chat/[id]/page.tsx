import { asc, eq } from "drizzle-orm"
import type { SessionState } from "eve/client"
import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { ResearchChat } from "@/components/research-chat"
import { auth } from "@/lib/auth"
import type { ChatEvent } from "@/lib/chat-events"
import { db } from "@/lib/db"
import { chat, chatEvent, document, project } from "@/lib/db/schema"
import { initialQuery } from "@/lib/urls"

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    q?: string | string[]
    mode?: string | string[]
  }>
}) {
  const { id } = await params
  const query = await searchParams
  const initialPrompt = initialQuery(query.q)
  const requestedMode = Array.isArray(query.mode) ? query.mode[0] : query.mode

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

  const documents = initialPrompt
    ? await db
        .select({
          id: document.id,
          filename: document.filename,
          status: document.status,
          kind: document.kind,
          url: document.blobUrl,
          mimeType: document.mimeType,
          messageIndex: document.messageIndex,
        })
        .from(document)
        .where(eq(document.chatId, id))
    : []

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
      initialPrompt={initialPrompt}
      initialMode={requestedMode === "deep" ? "deep" : "search"}
      initialDocuments={documents.map((doc) => ({
        ...doc,
        status: doc.status as "processing" | "ready" | "error",
        kind: doc.kind as "document" | "image",
      }))}
      projectId={row.projectId ?? undefined}
      projectInstructions={proj?.instructions ?? undefined}
      projectLinks={proj?.links ?? undefined}
    />
  )
}
