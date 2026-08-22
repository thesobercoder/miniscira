import { eq } from "drizzle-orm"
import {
  Client,
  defaultMessageReducer,
  type MessageStreamEvent,
} from "eve/client"
import { appBaseUrl } from "@/lib/base-url"
import { db } from "@/lib/db"
import { chat, chatEvent, lookout, project, user } from "@/lib/db/schema"
import { sendLookoutEmail } from "@/lib/email"

// Reduce the persisted stream into the final assistant answer text (for email).
function extractAnswerText(events: MessageStreamEvent[]): string {
  const reducer = defaultMessageReducer()
  let data = reducer.initial()
  for (const e of events) data = reducer.reduce(data, e)
  const assistant = [...data.messages]
    .reverse()
    .find((m) => m.role === "assistant")
  if (!assistant) return ""
  return assistant.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("")
    .trim()
}

/**
 * Run one lookout: create a result chat, run the agent headlessly as the owner,
 * persist the turn, then email the digest. Reused by the QStash callback and the
 * manual "Run now" trigger.
 */
export async function runLookout(
  lookoutId: string
): Promise<{ ok: boolean; chatId?: string; error?: string }> {
  const [lk] = await db
    .select()
    .from(lookout)
    .where(eq(lookout.id, lookoutId))
    .limit(1)
  if (!lk) return { ok: false, error: "Lookout not found" }
  // Paused lookouts don't run; a completed one-time lookout may be re-run manually.
  if (lk.status === "paused") return { ok: false, error: "Lookout is paused" }

  let instructions: string | null = null
  if (lk.projectId) {
    const [p] = await db
      .select({ instructions: project.instructions })
      .from(project)
      .where(eq(project.id, lk.projectId))
      .limit(1)
    instructions = p?.instructions ?? null
  }

  const [row] = await db
    .insert(chat)
    .values({
      userId: lk.userId,
      projectId: lk.projectId,
      lookoutId: lk.id,
      title: lk.name,
    })
    .returning({ id: chat.id })

  const clientContext: Record<string, string> = {
    lookout:
      `Automated recurring "Lookout" run named "${lk.name}". Produce a fresh, dated briefing ` +
      `that leads with what's new and noteworthy right now. Be concise and skimmable.`,
  }
  if (instructions?.trim())
    clientContext.projectInstructions = instructions.trim()

  const client = new Client({ host: appBaseUrl() })
  const session = client.session()
  const events: MessageStreamEvent[] = []

  try {
    const response = await session.send({
      message: lk.prompt,
      clientContext,
      headers: {
        "x-internal-secret": process.env.LOOKOUT_RUN_SECRET ?? "",
        "x-internal-user": lk.userId,
      },
    })
    for await (const event of response) events.push(event)

    if (events.length > 0) {
      await db
        .insert(chatEvent)
        .values(events.map((event, i) => ({ chatId: row.id, seq: i, event })))
    }
    await db
      .update(chat)
      .set({
        eveSessionId: response.sessionId ?? null,
        continuationToken: response.continuationToken ?? null,
        streamIndex: events.length,
        updatedAt: new Date(),
      })
      .where(eq(chat.id, row.id))
  } catch (err) {
    console.error("lookout run failed", err)
    return {
      ok: false,
      chatId: row.id,
      error: err instanceof Error ? err.message : "run failed",
    }
  }

  // A one-time lookout is done after it fires.
  await db
    .update(lookout)
    .set({
      lastRunAt: new Date(),
      updatedAt: new Date(),
      ...(lk.frequency === "once"
        ? { status: "completed", nextRunAt: null }
        : {}),
    })
    .where(eq(lookout.id, lk.id))

  const [u] = await db
    .select({ email: user.email, name: user.name })
    .from(user)
    .where(eq(user.id, lk.userId))
    .limit(1)
  if (u?.email) {
    await sendLookoutEmail({
      // Self-hosted operators may keep their login/profile email separate from
      // the mailbox that receives automated research digests.
      to: process.env.LOOKOUT_EMAIL_TO || u.email,
      name: u.name,
      lookoutName: lk.name,
      answer: extractAnswerText(events),
      chatUrl: `${appBaseUrl()}/chat/${row.id}`,
    }).catch((err) => console.error("lookout email failed", err))
  }

  return { ok: true, chatId: row.id }
}
