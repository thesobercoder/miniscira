/**
 * Opt-in per-user request limiting for the REST API.
 *
 * Off unless `RATE_LIMIT_PER_MINUTE` is set to a positive integer — one
 * variable that both enables and configures, so there is no way to enable it
 * and forget to give it a budget.
 *
 * Deliberately in-memory. A shared store (Redis/Upstash) would be a service to
 * run, a dependency to keep current, and a network round trip on every request,
 * which is a poor trade for a limiter nobody has asked for yet. The cost of
 * that choice is stated plainly below rather than hidden.
 *
 * LIMITS OF THIS LIMITER — read before relying on it:
 *
 * - **Per process.** Counters live in this process's heap. Behind N instances
 *   the effective ceiling is N × the configured value. It is a brake on a
 *   single runaway client, not a quota.
 * - **Resets on deploy.** Restarting clears every window.
 * - **Does not cover the expensive path.** Agent turns run over `/eve/v1/*`,
 *   which `withEve` rewrites straight to the agent server without passing
 *   through these route handlers. This caps REST calls, not model spend. The
 *   spend guards are `maxOutputTokensPerSession` / `maxInputTokensPerSession`
 *   in `agent/agent.ts`.
 */

/** Fixed-window counters, keyed by principal. */
const windows = new Map<string, { count: number; resetAt: number }>()

const WINDOW_MS = 60_000

/**
 * Cap on tracked keys, so a burst of distinct principals cannot grow the map
 * without bound. Eviction drops the entries closest to expiry, which are the
 * ones whose loss matters least.
 */
const MAX_KEYS = 10_000

export type RateLimitVerdict =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }

/** The configured budget, or null when the feature is off. */
export function configuredLimit(): number | null {
  const raw = process.env.RATE_LIMIT_PER_MINUTE
  if (!raw) return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function evictOldest() {
  // Cheapest correct thing: one pass, drop the earliest-expiring tenth.
  const entries = [...windows.entries()].sort(
    (a, b) => a[1].resetAt - b[1].resetAt
  )
  for (const [key] of entries.slice(0, Math.ceil(MAX_KEYS / 10)))
    windows.delete(key)
}

/**
 * Record a request against `key` and say whether it may proceed.
 *
 * `now` is injectable so the window arithmetic can be tested without waiting
 * a real minute.
 */
export function rateLimit(key: string, now = Date.now()): RateLimitVerdict {
  const limit = configuredLimit()
  if (limit === null) return { allowed: true }

  const existing = windows.get(key)
  if (!existing || now >= existing.resetAt) {
    if (windows.size >= MAX_KEYS) evictOldest()
    windows.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true }
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      // Always at least 1: a sub-second remainder rounds to 0, and
      // `Retry-After: 0` invites an immediate retry into the same closed window.
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000)
      ),
    }
  }

  existing.count += 1
  return { allowed: true }
}

/** Drop all counters. Tests only — never call this from request handling. */
export function resetRateLimits() {
  windows.clear()
}
