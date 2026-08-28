import type { StreamReconnectPolicy } from "eve/client"

/**
 * Outer reconnect loop for a durable Eve turn.
 *
 * Eve's iterator already retries transient failures internally. If that bounded
 * iterator eventually ends without a turn boundary, open a fresh iterator from
 * the persisted cursor and keep following the same server-side turn. Only an
 * explicit abort or a real boundary ends this loop.
 */
export async function consumeDurableTurn<T>({
  initialStream,
  reopen,
  isBoundary,
  onEvent,
  signal,
  reconnectPolicy: _reconnectPolicy,
}: {
  initialStream: AsyncIterable<T>
  reopen: () => AsyncIterable<T>
  isBoundary: (event: T) => boolean
  onEvent: (event: T) => void | Promise<void>
  signal?: AbortSignal
  /** Documents that each iterator is expected to use this SDK policy. */
  reconnectPolicy?: StreamReconnectPolicy
}): Promise<{ settled: boolean; received: number }> {
  let stream = initialStream
  let received = 0

  while (!signal?.aborted) {
    try {
      for await (const event of stream) {
        received += 1
        await onEvent(event)
        if (isBoundary(event)) return { settled: true, received }
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError" || signal?.aborted) break
      console.error("eve stream error", err)
    }

    if (signal?.aborted) break
    stream = reopen()
  }

  return { settled: false, received }
}
