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

/**
 * Read the browser's actual URL rather than Next's mounted pathname. A chat
 * created from `/` updates history without remounting so the two can differ.
 */
export function browserIsOnChat(id: string): boolean {
  return window.location.pathname === chatPath(id)
}

/** A fresh research page must reset the mounted chat, not only its URL. */
export function navigateToNewResearch(): void {
  window.location.assign("/")
}
