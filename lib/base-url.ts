// Absolute origin for server-side self-calls and links in outbound email.
import { DEFAULT_RUNTIME_PORT } from "./runtime-port"

export function appBaseUrl() {
  return (
    process.env.APP_URL ||
    process.env.BETTER_AUTH_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : `http://localhost:${runtimePortFallback()}`)
  )
}

function runtimePortFallback(): number {
  const raw = process.env.PORT?.trim()
  if (!raw) return DEFAULT_RUNTIME_PORT
  const port = Number.parseInt(raw, 10)
  return String(port) === raw && port >= 1 && port <= 65_535
    ? port
    : DEFAULT_RUNTIME_PORT
}
