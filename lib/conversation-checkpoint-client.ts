import type { UserContent } from "ai"

import {
  type BootstrapContext,
  wrapBootstrapMessage,
} from "@/lib/bootstrap-envelope"

function isBootstrapContext(value: unknown): value is BootstrapContext {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.checkpointId === "string" &&
    Number.isInteger(candidate.coveredMessageCount) &&
    typeof candidate.coveredMessageDigest === "string" &&
    typeof candidate.summary === "string"
  )
}

type CheckpointFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

export async function checkpointedMessage({
  chatId,
  model,
  message,
  retainedMessageIds,
  fetcher = fetch,
}: {
  chatId: string
  model: string
  message: UserContent
  retainedMessageIds?: readonly string[]
  fetcher?: CheckpointFetch
}): Promise<UserContent> {
  const response = await fetcher(`/api/chats/${chatId}/checkpoint`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, retainedMessageIds }),
  })
  const body = (await response.json().catch(() => ({}))) as {
    checkpoint?: unknown
    error?: unknown
  }
  if (!response.ok) {
    throw new Error(
      typeof body.error === "string"
        ? body.error
        : "Couldn't prepare the conversation checkpoint."
    )
  }
  if (body.checkpoint == null) return message
  if (!isBootstrapContext(body.checkpoint)) {
    throw new Error("The conversation checkpoint response was invalid.")
  }
  return wrapBootstrapMessage(message, body.checkpoint)
}
