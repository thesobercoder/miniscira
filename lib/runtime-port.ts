// Single source for the runtime HTTP port.
//
// Railway injects PORT; local dev/compose default to 3000. Invalid values
// throw so callers (entrypoint, health checks, loopback fetches) fail fast
// instead of listening on a surprising port.
export const DEFAULT_RUNTIME_PORT = 3000

export function resolveRuntimePort(
  env: Readonly<Record<string, string | undefined>> = process.env
): number {
  const raw = env.PORT?.trim()
  if (!raw) return DEFAULT_RUNTIME_PORT
  if (!/^\d+$/.test(raw)) {
    throw new Error(`PORT must be an integer between 1 and 65535 (got "${raw}")`)
  }
  const port = Number.parseInt(raw, 10)
  if (port < 1 || port > 65_535) {
    throw new Error(`PORT must be an integer between 1 and 65535 (got "${raw}")`)
  }
  return port
}
