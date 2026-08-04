import { xai } from "@ai-sdk/xai"
import { generateText } from "ai"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { authedWithParams } from "@/lib/api-auth"
import { requireOwnedChat } from "@/lib/api-ownership"
import { db } from "@/lib/db"
import { chat } from "@/lib/db/schema"

// POST /api/chats/:id/title — generate a short title from the first question.
export const POST = authedWithParams<{ id: string }>(
  async (request, { userId, params: { id } }) => {
    const owned = await requireOwnedChat(id, userId)
    if ("error" in owned) return owned.error
    const row = owned.chat

    const body = (await request.json().catch(() => ({}))) as {
      message?: string
    }
    const question = (body.message ?? "").trim().slice(0, 500)
    if (!question) return NextResponse.json({ title: row.title })

    let title = row.title
    try {
      const { text } = await generateText({
        // Cheap, fast model via the AI Gateway (AI_GATEWAY_API_KEY).
        model: xai("grok-4.20-non-reasoning"),
        prompt:
          "Write a concise 3–6 word title in Title Case for a research conversation that " +
          "starts with the question below. No quotes, no trailing punctuation, no preamble — " +
          `just the title.\n\nQuestion: ${question}\n\nTitle:`,
      })
      const cleaned = text
        .trim()
        .replace(/^["'#\s]+|["'.\s]+$/g, "")
        .slice(0, 80)
      if (cleaned) title = cleaned
    } catch (err) {
      console.error("title generation failed", err)
    }

    await db
      .update(chat)
      .set({ title, updatedAt: new Date() })
      .where(eq(chat.id, id))
    return NextResponse.json({ title })
  }
)
