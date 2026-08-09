import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { NextRequest } from "next/server"

import { proxy } from "./proxy"

const at = (path: string, opts?: { signedIn?: boolean }) => {
  const req = new NextRequest(`https://miniscira.com${path}`)
  // better-auth's `getSessionCookie` looks for this name; its presence is the
  // whole of the optimistic check the proxy performs.
  if (opts?.signedIn)
    req.cookies.set("better-auth.session_token", "a.signature")
  return proxy(req)
}

const demo = (on: boolean) => {
  if (on) process.env.DEMO_MODE = "true"
  else delete process.env.DEMO_MODE
}

// Bun loads `.env`, and `DEMO_MODE=true` is exactly what a developer sets to
// preview the landing page — so every test states the mode it needs rather than
// assuming the variable is absent. Relying on absence meant the suite went red
// on any machine previewing the landing page, while CI stayed green because it
// has no `.env` at all.
const ambient = process.env.DEMO_MODE
beforeEach(() => demo(false))
afterAll(() => {
  if (ambient === undefined) delete process.env.DEMO_MODE
  else process.env.DEMO_MODE = ambient
})

describe("demo mode off (the self-host default)", () => {
  test("anonymous visitors are sent to sign-in with a return path", () => {
    const res = at("/settings")
    expect(res.status).toBe(307)
    const to = new URL(res.headers.get("location") ?? "")
    expect(to.pathname).toBe("/sign-in")
    expect(to.searchParams.get("redirect")).toBe("/settings")
  })

  test("anonymous query links preserve the complete return target", () => {
    const res = at("/?q=Who%20won%20the%20most%20oscars%3F")
    const to = new URL(res.headers.get("location") ?? "")

    expect(to.pathname).toBe("/sign-in")
    expect(to.searchParams.get("redirect")).toBe(
      "/?q=Who%20won%20the%20most%20oscars%3F"
    )
  })

  test("signed-in visitors reach the app", () => {
    expect(at("/", { signedIn: true }).headers.get("location")).toBeNull()
  })

  test("signed-in requests carry the return target for server validation", () => {
    const res = at("/?q=Who%20won%20the%20most%20oscars%3F", {
      signedIn: true,
    })

    expect(res.headers.get("x-middleware-request-x-next-pathname")).toBe("/")
    expect(res.headers.get("x-middleware-request-x-next-search")).toBe(
      "?q=Who%20won%20the%20most%20oscars%3F"
    )
  })
})

describe("demo mode on", () => {
  test("/ serves the landing page without changing the URL", () => {
    demo(true)
    const res = at("/")
    // A rewrite, not a redirect: the marketing URL stays the bare domain.
    expect(res.headers.get("location")).toBeNull()
    expect(res.headers.get("x-middleware-rewrite")).toContain("/landing")
  })

  test("app routes fold back to /", () => {
    demo(true)
    for (const path of ["/settings", "/projects", "/chat/abc", "/lookouts"]) {
      const res = at(path)
      expect(res.status).toBe(307)
      expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/")
    }
  })

  test("a signed-in visitor cannot slip past the landing page", () => {
    // The check runs before the session lookup on purpose: demo mode is about
    // what this deployment offers, not about who is asking.
    demo(true)
    const res = at("/chat/abc", { signedIn: true })
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/")
  })

  test("the landing route itself is not redirected into a loop", () => {
    demo(true)
    const res = at("/landing")
    expect(res.headers.get("location")).toBeNull()
  })
})
