export function sanitizeMcpHeaders(
  input: unknown
): Record<string, string> | null {
  if (!input || typeof input !== "object") return null

  const out: Record<string, string> = {}
  for (const [rawName, rawValue] of Object.entries(
    input as Record<string, unknown>
  )) {
    if (typeof rawValue !== "string") continue
    const value = rawValue.trim()
    if (!value) continue

    // The manual form is primarily used for bearer authentication. If a
    // client submits a value without a header name, use the standard header
    // instead of silently discarding the credential.
    const name = rawName.trim() || "Authorization"
    out[name] = value
  }

  return Object.keys(out).length > 0 ? out : null
}
