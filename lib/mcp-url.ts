export type McpUrlResult =
  | { ok: true; url: URL; insecure: boolean }
  | { ok: false; error: string }

function parseHttpUrl(value: string, label: string): McpUrlResult {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { ok: false, error: `${label} is not a valid URL.` }
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return { ok: false, error: `${label} must use http:// or https://.` }
  if (url.username || url.password)
    return {
      ok: false,
      error: `${label} must not include a username or password.`,
    }
  if (url.hash)
    return { ok: false, error: `${label} must not include a fragment.` }
  return { ok: true, url, insecure: url.protocol === "http:" }
}

export function validateMcpServerUrl(value: string): McpUrlResult {
  return parseHttpUrl(value, "MCP server URL")
}

export function validateMcpCallbackUrl(value: string): McpUrlResult {
  return parseHttpUrl(value, "OAuth callback URL")
}

export function sameCallbackTarget(expected: string, actual: URL): boolean {
  const parsed = validateMcpCallbackUrl(expected)
  return (
    parsed.ok &&
    parsed.url.origin === actual.origin &&
    parsed.url.pathname === actual.pathname
  )
}
