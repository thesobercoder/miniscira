import { openFor, sealFor } from "@/lib/secret-box"

const KEY_INFO = "miniscira:mcp-credentials:v1"
const PREFIX = "mcp-sealed:v1:"
const ENVELOPE_KEY = "__miniscira_sealed_v1"

export function sealMcpSecret(value: string): string {
  return `${PREFIX}${sealFor(value, KEY_INFO)}`
}

export function openMcpSecret(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.startsWith(PREFIX)) return value
  return openFor(value.slice(PREFIX.length), KEY_INFO)
}

export function isSealedMcpSecret(value: string): boolean {
  return value.startsWith(PREFIX)
}

export function sealMcpHeaders(
  headers: Record<string, string> | null | undefined
): Record<string, string> | null {
  if (!headers) return null
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, sealMcpSecret(value)])
  )
}

export function openMcpHeaders(
  headers: Record<string, string> | null | undefined
): Record<string, string> | null {
  if (!headers) return null
  const opened: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    const plaintext = openMcpSecret(value)
    if (plaintext == null)
      throw new Error(
        "Stored MCP credential cannot be decrypted. Save the credential again."
      )
    opened[name] = plaintext
  }
  return Object.keys(opened).length > 0 ? opened : null
}

export function sealMcpJson(
  value: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!value) return null
  return { [ENVELOPE_KEY]: sealMcpSecret(JSON.stringify(value)) }
}

export function openMcpJson<T extends Record<string, unknown>>(
  value: Record<string, unknown> | null | undefined
): T | null {
  if (!value) return null
  const sealed = value[ENVELOPE_KEY]
  if (typeof sealed !== "string") return value as T
  const plaintext = openMcpSecret(sealed)
  if (!plaintext) return null
  try {
    return JSON.parse(plaintext) as T
  } catch {
    return null
  }
}

export function isSealedMcpJson(
  value: Record<string, unknown> | null | undefined
): boolean {
  return typeof value?.[ENVELOPE_KEY] === "string"
}
