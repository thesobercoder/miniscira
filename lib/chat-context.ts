import type { EveMessage } from "eve/client"
import { partText } from "./chat-events"

/**
 * Builds the `clientContext` a turn rides in with.
 *
 * Data only — deliberately no prose. Telling the agent how to behave belongs in
 * agent/instructions/00-core.md, which documents every key below; this side just
 * says *what* is present, never *what to do* about it. Adding a key here means
 * adding a line to 00-core.md, not a hint string.
 */

export type ChatContextInput = {
  /** Sticky model choice; agent/agent.ts resolves the model from this marker. */
  chatModel: string
  projectInstructions?: string | null
  projectLinks?: readonly string[]
  /** "deep" asks the agent to load the deep_research skill. */
  deepResearch?: boolean
  /** Filenames of non-image uploads riding along with this message. */
  uploadedDocuments?: readonly string[]
  /**
   * Prior history for a chat whose durable session can't see it (a branch, or
   * an expired session). eve sessions can't be forked, so we seed a recap.
   */
  conversationRecap?: string | null
}

export type ChatContext = Record<string, string | string[]>

export function buildClientContext(input: ChatContextInput): ChatContext {
  const context: ChatContext = { chatModel: input.chatModel }

  const instructions = input.projectInstructions?.trim()
  if (instructions) context.projectInstructions = instructions

  if (input.projectLinks && input.projectLinks.length > 0)
    context.projectLinks = [...input.projectLinks]

  if (input.deepResearch) context.mode = "deep_research"

  if (input.uploadedDocuments && input.uploadedDocuments.length > 0)
    context.uploadedDocuments = [...input.uploadedDocuments]

  if (input.conversationRecap)
    context.conversationRecap = input.conversationRecap

  return context
}

const RECAP_TURNS = 8
const RECAP_PER_MESSAGE = 1200
const RECAP_TOTAL = 6000

/**
 * Flattens the tail of a conversation into the recap a branched chat seeds its
 * fresh durable session with, so the agent isn't blind to history the user can
 * plainly see above the composer.
 */
export function conversationRecap(messages: readonly EveMessage[]): string {
  return messages
    .slice(-RECAP_TURNS)
    .map(
      (m) =>
        `${m.role === "user" ? "User" : "Assistant"}: ${partText(
          m.parts,
          "text"
        ).slice(0, RECAP_PER_MESSAGE)}`
    )
    .filter((line) => line.length > "Assistant: ".length)
    .join("\n\n")
    .slice(0, RECAP_TOTAL)
}
