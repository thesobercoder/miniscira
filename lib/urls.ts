/**
 * URL display helpers, shared by everything that shows a source: the research
 * timeline, inline citations in answers, project link lists, and the MCP server
 * catalog. They live here rather than in any one of those so the markdown
 * renderer and the timeline don't have to import from each other.
 */

/** Maximum prompt accepted from the root page's `q` query parameter. */
export const MAX_QUERY_LENGTH = 8_000

/**
 * Normalizes Next.js's already-decoded search-param value for one chat turn.
 * Repeated parameters are deterministic: the first value wins.
 */
export function initialQuery(value: string | string[] | undefined): string {
  const first = Array.isArray(value) ? value[0] : value
  return first?.trim().slice(0, MAX_QUERY_LENGTH) ?? ""
}

/** Removes the consumed prompt while preserving unrelated search and hash. */
export function withoutInitialQuery(value: string): string {
  const url = new URL(value)
  url.searchParams.delete("q")
  return `${url.pathname}${url.search}${url.hash}`
}

/**
 * A post-login redirect target that cannot leave this origin.
 *
 * `/sign-in?redirect=…` is attacker-controllable, and the value is used twice:
 * `router.push()` after an email login, and better-auth's `callbackURL` for
 * social sign-in. An absolute URL there turns the login page into an open
 * redirect — the phishing-valuable kind, because the bounce happens *after* the
 * user has authenticated on a domain they trust.
 *
 * Resolved with the same parser the browser will use, rather than checked with
 * string prefixes. Prefix tests lose to parser normalisation: `/\t/evil.com`
 * passes `startsWith("/")` and is not `//…`, but the WHATWG URL parser strips
 * ASCII tab, CR and LF *before* parsing, so it becomes `//evil.com` and
 * navigates off-site. `\` and percent-encoded variants have the same shape of
 * problem. Resolving against a placeholder origin and requiring the result to
 * still be on it closes the whole family at once, because any escape shows up
 * as a different origin whatever trick produced it.
 *
 * Returns the path only, so nothing from the caller's string can survive into
 * the origin.
 */
const REDIRECT_BASE = "https://redirect.invalid"

export function safeRedirect(
  value: string | null | undefined,
  fallback = "/"
): string {
  if (!value) return fallback
  try {
    const url = new URL(value, REDIRECT_BASE)
    // Absolute URLs, protocol-relative ones, and every whitespace or backslash
    // variant that normalises into one all land on a different origin here.
    // `javascript:` and `data:` resolve to the opaque origin "null".
    if (url.origin !== REDIRECT_BASE) return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}

/** Signed-in visitors should never remain on the sign-in route itself. */
export function signedInRedirect(value: string | null | undefined): string {
  const target = safeRedirect(value)
  return target === "/sign-in" || target.startsWith("/sign-in?") ? "/" : target
}

/** Parses a URL, or returns null instead of throwing on a malformed one. */
export function tryParseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/** Display host for a URL: `https://www.arxiv.org/abs/1` → `arxiv.org`. */
export function hostOf(url: string) {
  return tryParseUrl(url)?.hostname.replace(/^www\./, "") ?? url
}

/**
 * Compact, Perplexity-style source label: drop the trailing TLD segment
 * (arxiv.org → arxiv, news.ycombinator.com → news.ycombinator).
 */
export function shortHost(host: string) {
  const parts = host.split(".")
  return parts.length > 1 ? parts.slice(0, -1).join(".") : host
}

/**
 * Favicon for a host. Google's s2 service serves a generic globe for domains
 * that have none, so this never 404s.
 */
export function faviconFor(host: string) {
  return `https://www.google.com/s2/favicons?domain=${host}&sz=128`
}

/**
 * Favicon for a service's *main* domain, collapsing the subdomain that a
 * machine endpoint usually lives on: `mcp.deepwiki.com` → `deepwiki.com`,
 * `mcp.zapier.com/api/v1/connect` → `zapier.com`. Returns undefined when the
 * URL doesn't parse.
 */
export function faviconForServiceUrl(url: string): string | undefined {
  const host = tryParseUrl(url)?.hostname
  return host ? faviconFor(host.split(".").slice(-2).join(".")) : undefined
}
