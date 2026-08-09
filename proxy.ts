import { getSessionCookie } from "better-auth/cookies"
import { type NextRequest, NextResponse } from "next/server"

import { isDemoMode, LANDING_PATH } from "@/lib/demo-mode"

// Next.js 16 renames "middleware" to "proxy". This is an optimistic cookie
// check only — it redirects anonymous visitors to /sign-in. Real session
// validation still happens in each server component / route handler via
// `auth.api.getSession`, and on the eve channel via its route-auth walk.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // Demo mode short-circuits the whole app shell, before the session check:
  // the landing page has to be readable signed out, and a signed-in visitor
  // must not slip past it either. `/docs` and `/sign-in` are already outside
  // this matcher, so they keep working.
  if (isDemoMode()) {
    // Serve the landing page *at* `/` rather than redirecting to `/landing`,
    // so the marketing URL stays the bare domain.
    if (pathname === "/")
      return NextResponse.rewrite(new URL(LANDING_PATH, request.url))
    // Everything else in the app shell folds back to it. A redirect, not a
    // rewrite: those URLs genuinely do not exist in this deployment, and
    // leaving them addressable would show a chrome-less half-app.
    if (pathname !== LANDING_PATH)
      return NextResponse.redirect(new URL("/", request.url))
    return NextResponse.next()
  }

  const sessionCookie = getSessionCookie(request)

  if (!sessionCookie) {
    const signInUrl = new URL("/sign-in", request.url)
    signInUrl.searchParams.set("redirect", `${pathname}${search}`)
    return NextResponse.redirect(signInUrl)
  }

  // The cookie check above is intentionally optimistic. Preserve the current
  // target in request headers too, so the layout can keep it if server-side
  // session validation rejects a stale or invalid cookie.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-next-pathname", pathname)
  requestHeaders.set("x-next-search", search)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  // Guard the app shell, but never the eve routes, the auth API, sign-in, the
  // docs, or static assets.
  matcher: [
    "/((?!api|eve|sign-in|docs|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
