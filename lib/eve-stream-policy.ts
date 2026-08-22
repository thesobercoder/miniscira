import type { StreamReconnectPolicy } from "eve/client"

/**
 * Reconnection policy for durable research and delegated-agent streams.
 *
 * Eve's SDK default gives up on an idle stream after only five no-progress
 * reconnects (about eight seconds of backoff). That is fine for a short chat but
 * too aggressive for long research running behind a reverse proxy or across a
 * laptop sleep/network handoff. The session/event log is durable, so continuing
 * from its absolute cursor is both safe and cheaper than declaring the work
 * disconnected while it is still running server-side.
 */
export const EVE_LONG_RUNNING_STREAM_POLICY = {
  // Preserve Eve's defaults and add common proxy/rate-limit responses seen by
  // self-hosted deployments.
  retryableErrorStatuses: [404, 408, 409, 425, 429, 500, 502, 503, 504],
  streamOpenReconnectPolicy: {
    baseDelayMs: 250,
    maxAttempts: 24,
    maxDelayMs: 10_000,
  },
  streamIdleReconnectPolicy: {
    baseDelayMs: 500,
    maxAttempts: 125,
    maxDelayMs: 5_000,
  },
} satisfies StreamReconnectPolicy

type RetryPolicy = {
  readonly baseDelayMs?: number
  readonly maxAttempts?: number
  readonly maxDelayMs?: number
}

/** Total backoff window before Eve gives up after repeated no-progress closes. */
export function reconnectWindowMs(policy?: RetryPolicy): number {
  const base = policy?.baseDelayMs ?? 0
  const attempts = policy?.maxAttempts ?? 0
  const max = policy?.maxDelayMs ?? base
  let delay = base
  let total = 0
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    total += delay
    delay = Math.min(delay * 2, max)
  }
  return total
}

/** Whether an exhausted child-stream iterator should be attached again. */
export function shouldReattachSubagent({
  aborted,
  completed,
}: {
  aborted: boolean
  completed: boolean
}): boolean {
  return !aborted && !completed
}
