const GRANT_TTL_MS = 10 * 60 * 1000
const MAX_GRANTS = 500

type Grant = { ids: Set<string>; expiresAt: number }
const grants = new Map<string, Grant>()

export function threadSearchGrantKey(userId: string, rootSessionId: string) {
  return `${userId}\u0000${rootSessionId}`
}

function prune(now = Date.now()) {
  for (const [key, grant] of grants)
    if (grant.expiresAt <= now) grants.delete(key)
  while (grants.size >= MAX_GRANTS) {
    const oldest = grants.keys().next().value
    if (typeof oldest !== "string") break
    grants.delete(oldest)
  }
}

export function replaceThreadSearchGrant(key: string, ids: string[]) {
  prune()
  grants.delete(key)
  grants.set(key, {
    ids: new Set(ids),
    expiresAt: Date.now() + GRANT_TTL_MS,
  })
}

export function clearThreadSearchGrant(key: string) {
  grants.delete(key)
}

export function hasThreadSearchGrant(key: string, id: string) {
  prune()
  return grants.get(key)?.ids.has(id) ?? false
}
