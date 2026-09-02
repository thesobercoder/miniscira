
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

  return context
}
