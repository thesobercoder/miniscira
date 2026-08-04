"use client"

import { toast } from "sonner"

/**
 * Mutating calls to this app's own API, with failures that are actually visible.
 *
 * The pattern this replaces was `await fetch(…).catch(() => {})` — sites that
 * discarded the rejection *and* never looked at `res.ok`, so a 403, a 500 and a
 * dropped connection were all indistinguishable from success. The worst of them
 * deleted-then-navigated, telling the reader it had worked whatever the server
 * said.
 *
 * Reads stay on plain `fetch`: they already branch on the parsed body, and a
 * failed read degrades to an empty list rather than a silent lie.
 */

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /**
     * The server's own explanation, when it gave one.
     *
     * Separate from `message` so callers can tell a real reason ("File is too
     * large (max 12 MB).", "Too many requests") from the synthesized
     * `Request failed (500)` fallback. Only the former is worth showing in
     * place of the caller's context.
     */
    readonly detail?: string
  ) {
    super(message)
    this.name = "ApiError"
  }
}

type MutateInit = Omit<RequestInit, "body"> & { body?: unknown }

async function mutate(
  url: string,
  { body, headers, ...init }: MutateInit
): Promise<void> {
  const res = await fetch(url, {
    ...init,
    headers:
      body === undefined
        ? headers
        : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.ok) return
  // The API answers errors as `{ error: string }`; fall back to the status when
  // it doesn't (a proxy error page, an empty 502).
  const detail = await res
    .json()
    .then((j: { error?: string }) => j?.error)
    .catch(() => undefined)
  throw new ApiError(
    res.status,
    detail ?? `Request failed (${res.status})`,
    detail
  )
}

/**
 * Send a mutation; on failure show a toast and report it.
 *
 * Returns whether it succeeded, so a caller that must roll back optimistic UI
 * or must not navigate can branch on it.
 *
 * The server's explanation wins over `errorMessage` when there is one. That
 * ordering matters: `errorMessage` says which action failed ("Couldn't remove
 * Linear."), but only the server knows *why* — that the file exceeded 12 MB, or
 * that the user is over their rate limit and should wait. Showing the caller's
 * generic line instead leaves someone retrying straight into the same
 * rejection. `errorMessage` still covers the cases with no useful body: a 500,
 * a proxy error page, a dropped connection.
 */
export async function mutateOrToast(
  url: string,
  init: MutateInit & { errorMessage?: string } = {}
): Promise<boolean> {
  const { errorMessage, ...rest } = init
  try {
    await mutate(url, rest)
    return true
  } catch (err) {
    const detail = err instanceof ApiError ? err.detail : undefined
    toast.error(detail ?? errorMessage ?? "Something went wrong. Try again.")
    return false
  }
}
