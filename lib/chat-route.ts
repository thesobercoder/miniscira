export function chatPath(id: string): `/chat/${string}` {
  return `/chat/${encodeURIComponent(id)}`
}

/**
 * Promote the lazily-created home-page conversation to its durable chat URL
 * without mounting a second ResearchChat while the first turn is streaming.
 */
export function replaceWithChatPath(id: string): string {
  const path = chatPath(id)
  window.history.replaceState(window.history.state, "", path)
  return path
}
