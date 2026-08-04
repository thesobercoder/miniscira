/**
 * Demo mode: serve a landing page instead of the app.
 *
 * miniscira.com is a showcase, not a hosted product — the app is meant to be
 * self-hosted, and running it publicly would mean either paying for strangers'
 * research or shipping a chat nobody can use. With the flag on, every product
 * route resolves to the landing page; with it off (the default, and what a
 * self-host gets) the app behaves normally.
 *
 * Read from the server only. A `NEXT_PUBLIC_` variable would be inlined into
 * the client bundle where it decides nothing — the switch happens in `proxy.ts`
 * before a request reaches a page.
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true"
}

/** Where the landing page lives. Rewritten onto `/` when demo mode is on. */
export const LANDING_PATH = "/landing"
