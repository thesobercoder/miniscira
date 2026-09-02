import { createHash } from "node:crypto"

import type { EveMessage, EveMessagePart } from "eve/client"


export interface StoredConversationCheckpoint {
  id: string
  chatId: string
  version: 1
  coveredMessageCount: number
  coveredMessageDigest: string
  summary: string
  createdAt: Date
}

const SECRET_QUERY = /([?&](?:access_token|api_key|apikey|auth|authorization|credential|key|password|secret|sig|signature|token)=)[^&#\s]*/gi
const SECRET_ASSIGNMENT = /(\b(?:aws_secret_access_key|aws_session_token|access[_-]?token|api[_-]?key|authorization|client[_-]?secret|connection[_-]?string|cookie|credential|database[_-]?url|dsn|id[_-]?token|password|private[_-]?key|redis[_-]?url|refresh[_-]?token|secret|session[_-]?token|token)(?:\b|(?=["']))["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi
const KNOWN_TOKEN = /\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/g
const URI_PASSWORD = /(\b[a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s/]+(@)/gi

function sanitizeText(value: string): string {
  return value
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi, "[REDACTED]")
    .replace(/\b(?:bearer|basic)\s+[^\s"'<>]+/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED]")
    .replace(KNOWN_TOKEN, "[REDACTED]")
    .replace(SECRET_QUERY, "$1[REDACTED]")
    .replace(SECRET_ASSIGNMENT, "$1[REDACTED]")
    .replace(URI_PASSWORD, "$1[REDACTED]$2")
}

const SECRET_KEYS = new Set([
  "accesstoken",
  "apikey",
  "authorization",
  "awssecretaccesskey",
  "awssessiontoken",
  "clientsecret",
  "connectionstring",
  "cookie",
  "credential",
  "databaseurl",
  "idtoken",
  "password",
  "privatekey",
  "refreshtoken",
  "redisurl",
  "secret",
  "sessiontoken",
  "token",
])

function serializeToolOutput(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === "string") return sanitizeText(value)
  try {
    return JSON.stringify(value, (key, item) => {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "")
      if (SECRET_KEYS.has(normalized)) return "[REDACTED]"
      return typeof item === "string" ? sanitizeText(item) : item
    })
  } catch {
    return "[unserializable tool output]"
  }
}

function renderPart(part: EveMessagePart): string | null {
  if (part.type === "text") {
    const text = sanitizeText(part.text)
    return text ? `${text}\n` : null
  }
  if (part.type === "file") {
    return `[Attachment: ${sanitizeText(part.filename ?? "unnamed")} (${sanitizeText(part.mediaType ?? "unknown")})]\n`
  }
  if (part.type === "dynamic-tool") {
    if (![
      "output-available",
      "output-error",
      "output-denied",
    ].includes(part.state)) return null
    const result =
      part.state === "output-available"
        ? serializeToolOutput(part.output)
        : part.state === "output-error"
          ? serializeToolOutput(part.errorText)
          : null
    return `[Tool: ${sanitizeText(part.toolName)} state=${part.state}]${
      result ? `\n${result}` : ""
    }\n`
  }

  return null
}

export function serializeCompactionUnits(
  messages: readonly EveMessage[]
): readonly string[] {
  return messages.flatMap((message, index) => {
    const body = message.parts
      .map(renderPart)
      .filter((part): part is string => part != null)
    if (body.length === 0) return []
    return [`[Message ${index + 1} ${message.role}]\n`, ...body, "[/Message]\n"]
  })
}

function safeEnd(value: string, proposedEnd: number): number {
  if (proposedEnd >= value.length) return value.length
  const code = value.charCodeAt(proposedEnd - 1)
  return code >= 0xd800 && code <= 0xdbff ? proposedEnd - 1 : proposedEnd
}

function semanticEnd(value: string, start: number, proposedEnd: number): number {
  const safe = safeEnd(value, proposedEnd)
  if (safe >= value.length) return safe
  for (let index = safe; index > start; index--) {
    if (/\s/.test(value[index - 1] ?? "")) return index
  }
  return safe
}

export function packCompactionUnits(
  units: readonly string[],
  maxChars: number
): readonly string[] {
  if (!Number.isInteger(maxChars) || maxChars < 1) {
    throw new RangeError("maxChars must be a positive integer")
  }

  const chunks: string[] = []
  let chunk = ""
  for (const unit of units) {
    let offset = 0
    while (offset < unit.length) {
      const room = maxChars - chunk.length
      const proposedEnd = Math.min(unit.length, offset + room)
      const end = semanticEnd(unit, offset, proposedEnd)
      if (end === offset) {
        if (chunk) chunks.push(chunk)
        chunk = ""
        continue
      }
      chunk += unit.slice(offset, end)
      offset = end
      if (end < proposedEnd || chunk.length === maxChars) {
        chunks.push(chunk)
        chunk = ""
      }
    }
  }
  if (chunk) chunks.push(chunk)
  return chunks
}

export function digestMessagePrefix(
  messages: readonly EveMessage[],
  count = messages.length
): string {
  if (!Number.isInteger(count) || count < 0 || count > messages.length) {
    throw new RangeError("count must select a valid message prefix")
  }
  const hash = createHash("sha256")
  for (let index = 0; index < count; index++) {
    const message = messages[index]
    const id = message?.id
    if (!id) throw new Error(`message ${index} has no stable id`)
    hash.update(String(id.length)).update(":").update(id).update("\n")
    const serialized = serializeCompactionUnits([message]).join("")
    hash
      .update(String(serialized.length))
      .update(":")
      .update(serialized)
      .update("\n")
  }
  return hash.digest("hex")
}

export class InvalidRetainedPrefixError extends Error {
  constructor() {
    super("Retained messages must be an exact visible transcript prefix")
    this.name = "InvalidRetainedPrefixError"
  }
}

export function retainedMessagePrefix(
  messages: readonly EveMessage[],
  retainedMessageIds?: readonly string[]
): readonly EveMessage[] {
  if (retainedMessageIds === undefined) return messages
  if (
    retainedMessageIds.length > messages.length ||
    retainedMessageIds.some((id, index) => messages[index]?.id !== id)
  ) {
    throw new InvalidRetainedPrefixError()
  }
  return messages.slice(0, retainedMessageIds.length)
}

export function selectCompatibleCheckpoint(
  messages: readonly EveMessage[],
  checkpoints: readonly StoredConversationCheckpoint[]
): StoredConversationCheckpoint | null {
  return (
    checkpoints
      .filter(
        (checkpoint) =>
          checkpoint.version === 1 &&
          checkpoint.coveredMessageCount <= messages.length &&
          checkpoint.coveredMessageDigest ===
            digestMessagePrefix(messages, checkpoint.coveredMessageCount)
      )
      .sort(
        (a, b) =>
          b.coveredMessageCount - a.coveredMessageCount ||
          b.createdAt.getTime() - a.createdAt.getTime()
      )[0] ?? null
  )
}
