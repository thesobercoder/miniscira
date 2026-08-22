import type { EveMessage } from "eve/client"

/**
 * Messages the replacement session is allowed to know about.
 *
 * Retry/edit is a true rewind: the selected question and every later message are
 * excluded, as are turns already hidden by an earlier replacement.
 */
export function messagesBeforeReplacement(
  messages: readonly EveMessage[],
  questionIndex: number,
  supersededIds: ReadonlySet<string>
): EveMessage[] {
  return messages
    .slice(0, questionIndex)
    .filter((message) => !supersededIds.has(message.id))
}

/** Message ids hidden when replacing a question from this point forward. */
export function replacementMessageIds(
  messages: readonly EveMessage[],
  questionIndex: number,
  supersededIds: ReadonlySet<string>
): string[] {
  return messages
    .slice(questionIndex)
    .filter((message) => !supersededIds.has(message.id))
    .map((message) => message.id)
}

/** Next durable attachment turn index, never reusing an already persisted row. */
export function nextReplacementTurnIndex(
  messages: readonly EveMessage[],
  userTurnOf: readonly number[]
): number {
  let greatest = -1
  for (let i = 0; i < messages.length; i += 1)
    if (messages[i]?.role === "user")
      greatest = Math.max(greatest, userTurnOf[i] ?? -1)
  return greatest + 1
}
