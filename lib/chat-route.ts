export function chatPath(id: string): `/chat/${string}` {
  return `/chat/${encodeURIComponent(id)}`
}

/**
 * Promote the lazily-created home-page conversation to its durable chat URL
 * without mounting a second ResearchChat while the first turn is streaming.
 */
export function replaceWithChatPath(id: string): string {
  const path = chatPath(id)
  // Next.js 16 documents native replaceState as a supported router API. A
  // null state lets Next's patched method copy its internal tree and dispatch
  // ACTION_RESTORE, keeping usePathname in sync without remounting this chat.
  window.history.replaceState(null, "", path)
  return path
}
