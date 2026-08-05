import { generateText } from "ai"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { authedWithParams } from "@/lib/api-auth"
import { requireOwnedChat } from "@/lib/api-ownership"
import { db } from "@/lib/db"
import { chat } from "@/lib/db/schema"
import { chatModel } from "@/lib/gateway"

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
        // Cheap, fast model via the deployment's own AI Gateway
        // (CLIProxyAPI). Self-hosted: this must stay on the gateway — the
        // upstream xai() call here needs XAI_API_KEY, which this deployment
        // does not (and cannot) hold.
        model: chatModel("gemini-3.1-flash-lite"),
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
