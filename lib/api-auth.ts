import { type NextRequest, NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { rateLimit } from "@/lib/rate-limit"

/**
 * Route handlers that require a signed-in user.
 *
 * This exists because the four-line preamble
 *
 *     const session = await auth.api.getSession({ headers: request.headers })
 *     if (!session)
 *       return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
 *
 * was copy-pasted twenty-six times across twenty-three route files. That is a
 * security surface maintained by convention: one omission is an auth bypass,
 * and an unauthenticated route is indistinguishable from one where the check
 * scrolled off the top of the screen.
 *
 * Wrapping instead of repeating makes the guarantee structural — a handler
 * cannot read `userId` without having been wrapped, so forgetting the check is
 * a type error rather than a silent hole.
 *
 * `proxy.ts` also redirects anonymous visitors, but that is an optimistic
 * cookie check on page routes only; it never runs for `/api/*`. This is the
 * real gate.
 */

export type AuthedContext<P = undefined> = {
  userId: string
  /** The full better-auth session, for the few routes that need more than the id. */
  session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>
  params: P
}

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 })

/**
 * Rejection for a principal over its budget.
 *
 * `Retry-After` is the part that matters: without it a client has no way to
 * back off other than guessing, and guessing means hammering.
 */
const tooManyRequests = (retryAfterSeconds: number) =>
  NextResponse.json(
    { error: "Too many requests" },
    { status: 429, headers: { "retry-after": String(retryAfterSeconds) } }
  )

/**
 * The session, or the response to return instead.
 *
 * Both wrappers share this so the auth check and the rate-limit check cannot
 * drift apart — the reason for wrapping in the first place.
 */
type Principal =
  | { error: Response; session?: undefined }
  | { error?: undefined; session: AuthedContext["session"] }

/**
 * Options a route can set on its wrapper.
 *
 * `metered: false` exempts a route from the per-user budget. Reserve it for
 * endpoints the *app* drives rather than the user: their request rate is a
 * property of the client's timers, not of anything a person did, so counting
 * them means the budget has to be set above the app's own idle traffic before
 * it can start braking real abuse.
 */
export type RouteOptions = { metered?: boolean }

async function resolvePrincipal(
  request: NextRequest,
  { metered = true }: RouteOptions
): Promise<Principal> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return { error: unauthorized() }
  // Keyed by user, not IP: the point is to brake one runaway account, and
  // every route here is already behind sign-in. Auth first, so an anonymous
  // flood cannot spend a real user's budget.
  if (!metered) return { session }
  const verdict = rateLimit(session.user.id)
  if (!verdict.allowed)
    return { error: tooManyRequests(verdict.retryAfterSeconds) }
  return { session }
}

type Handler<P> = (
  request: NextRequest,
  context: AuthedContext<P>
) => Promise<Response> | Response

/** Wrap a handler that takes no route params. */
export function authed(
  handler: Handler<undefined>,
  options: RouteOptions = {}
): (request: NextRequest) => Promise<Response> {
  return async (request) => {
    const resolved = await resolvePrincipal(request, options)
    if (resolved.error) return resolved.error
    return handler(request, {
      userId: resolved.session.user.id,
      session: resolved.session,
      params: undefined,
    })
  }
}

/**
 * Wrap a handler for a dynamic segment, e.g. `/api/chats/[id]`.
 *
 * Awaits `params` too, so handlers get the resolved object rather than the
 * promise Next 16 hands over.
 */
export function authedWithParams<P>(
  handler: Handler<P>,
  options: RouteOptions = {}
): (
  request: NextRequest,
  segment: { params: Promise<P> }
) => Promise<Response> {
  return async (request, segment) => {
    const resolved = await resolvePrincipal(request, options)
    if (resolved.error) return resolved.error
    return handler(request, {
      userId: resolved.session.user.id,
      session: resolved.session,
      params: await segment.params,
    })
  }
}

/** The two rejections every ownership check needs. */
export const notFound = () =>
  NextResponse.json({ error: "Not found" }, { status: 404 })
export const forbidden = () =>
  NextResponse.json({ error: "Forbidden" }, { status: 403 })
