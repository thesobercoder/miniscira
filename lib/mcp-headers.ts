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

export function validateMcpHeaders(
  headers: Record<string, string> | null,
  options: { required?: boolean } = {}
): string | null {
  if (!headers)
    return options.required ? "Authentication header is required." : null
  for (const [name, value] of Object.entries(headers)) {
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name))
      return "Header name is invalid."
    if (
      name.toLowerCase() === "authorization" &&
      !/^Bearer [^\s,]+$/i.test(value)
    )
      return "Authorization must be Bearer followed by a token."
  }
  return null
}
