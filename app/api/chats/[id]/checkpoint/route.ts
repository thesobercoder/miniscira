import { NextResponse } from "next/server"

import { authedWithParams } from "@/lib/api-auth"
import { requireOwnedChat } from "@/lib/api-ownership"
import { ensureConversationCheckpoint } from "@/lib/conversation-compaction"
import { InvalidRetainedPrefixError } from "@/lib/conversation-checkpoint"
import { NoGatewayCredentialError } from "@/lib/gateway-credentials"
import { MODEL_ID_RE } from "@/lib/models"

export const POST = authedWithParams<{ id: string }>(
  async (request, { userId, params: { id } }) => {
    const owned = await requireOwnedChat(id, userId)
    if ("error" in owned) return owned.error

    const body = (await request.json().catch(() => ({}))) as {
      model?: unknown
      retainedMessageIds?: unknown
    }
    if (typeof body.model !== "string" || !MODEL_ID_RE.test(body.model)) {
      return NextResponse.json({ error: "A valid model is required." }, { status: 400 })
    }
    const retainedMessageIds = body.retainedMessageIds
    if (
      retainedMessageIds !== undefined &&
      (!Array.isArray(retainedMessageIds) ||
        retainedMessageIds.some((id) => typeof id !== "string"))
    ) {
      return NextResponse.json(
        { error: "retainedMessageIds must be an array of message IDs." },
        { status: 400 }
      )
    }

    try {
      const checkpoint = await ensureConversationCheckpoint({
        chatId: id,
        userId,
        modelId: body.model,
        retainedMessageIds: retainedMessageIds as string[] | undefined,
      })
      return NextResponse.json({ checkpoint })
    } catch (error) {
      if (error instanceof InvalidRetainedPrefixError) {
        return NextResponse.json({ error: error.message }, { status: 409 })
      }
      if (error instanceof NoGatewayCredentialError) {
        return NextResponse.json({ error: error.message }, { status: 403 })
      }
      throw error
    }
  }
)
