import type { ComponentProps } from "react"

/**
 * A deliberate document navigation, not a Next client transition.
 *
 * A chat created lazily on `/` promotes its visible URL to `/chat/:id` with
 * history.replaceState so its live stream is not remounted. Next's router can
 * therefore still consider the mounted route to be `/`. A `<Link href="/">`
 * becomes a no-op in that state: the address bar changes while the running
 * ResearchChat remains mounted. A native anchor gives "New research" its
 * required reset semantics and lets the durable Eve run continue server-side.
 */
export function NewResearchLink(props: ComponentProps<"a">) {
  return <a href="/" {...props} />
}
