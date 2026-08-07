// Server-side: the model catalog, cached in memory for an hour. Shared by
// /api/models (the picker's list) and the model router (validation), so a
// picked id is always checked against the live catalog.
//
// Self-hosted: the catalog comes from the deployment's own OpenAI-compatible
// AI gateway (CLIProxyAPI by default), not the Vercel AI Gateway.

import { z } from "zod"

import { MODEL_VENDOR, providerOf } from "./models"

export type GatewayModel = {
  id: string
  name: string
  provider: string
  context: number
  vision: boolean
  fileInput: boolean
  released: number
}

/**
 * Base URL of the deployment's OpenAI-compatible gateway, no trailing slash.
 *
 * REQUIRED — there is no fallback. Every model call (chat, image generation,
 * the researcher subagent) and the model catalog go through this one endpoint,
 * so the app cannot answer a single turn without it. Throwing here beats the
 * confusing connection-refused failures a silent deployment-specific default
 * used to produce on hosts that do not run that gateway.
 */
export function gatewayBaseUrl(): string {
  const raw = process.env.AI_GATEWAY_BASE_URL
  if (!raw?.trim()) {
    throw new Error(
      "AI_GATEWAY_BASE_URL is not set. Point it at any OpenAI-compatible " +
        "endpoint (your own gateway/proxy). This variable is REQUIRED — every " +
        "model call goes through it, so the app cannot answer without it."
    )
  }
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new Error(
      `AI_GATEWAY_BASE_URL is not a valid URL: "${raw.trim()}". ` +
        "Use an absolute http(s) URL such as http://gateway:8000/v1."
    )
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `AI_GATEWAY_BASE_URL must be http(s): got "${url.protocol}". ` +
        "Use an absolute http(s) URL such as http://gateway:8000/v1."
    )
  }
  return url.toString().replace(/\/+$/, "")
}

// Models the gateway exposes that are not chat models (image/video generators)
// and must never appear in the chat picker.
const NON_CHAT_MODELS = new Set([
  "grok-imagine-image",
  "grok-imagine-image-quality",
  "grok-imagine-video",
  "grok-imagine-video-1.5",
  "grok-imagine-video-1.5-preview",
  "gemini-3.1-flash-image",
  "gpt-image-2",
  "gpt-image-1.5",
])

// The gateway does not advertise context windows, so every model gets the
// deployment-wide default (matches the 200K convention used elsewhere).
const DEFAULT_CONTEXT_WINDOW = 200_000
const CONTEXT_WINDOWS: Record<string, number> = {}

/**
 * The gateway's catalog is third-party data, so it's parsed rather than
 * asserted. `id` is required here (an entry without one is unusable); every
 * other field is optional and defaulted. Unknown entries are dropped, not
 * thrown on — one malformed model shouldn't empty the whole picker.
 */
const RawModelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  owned_by: z.string().optional(),
  created: z.number().optional(),
})

const CatalogSchema = z.object({
  data: z.array(z.unknown()).default([]),
})

/**
 * Shared across users on purpose.
 *
 * The catalog is a property of the gateway, not of whose key fetched it — every
 * key sees the same list. Caching per user would mean one upstream request per
 * signed-in person per hour for identical data.
 */
let cache: { at: number; models: GatewayModel[] } | null = null
const TTL_MS = 60 * 60 * 1000

/**
 * The selectable model catalog.
 *
 * `apiKey` is the caller's own gateway key. It has to be passed in rather than
 * read from the environment here: since users bring their own key, a deployment
 * may hold no `AI_GATEWAY_API_KEY` at all, and this silently returned an empty
 * list when that happened — the model picker rendered "No models match" with an
 * empty provider column and no indication why.
 */
export async function fetchGatewayModels(
  apiKey?: string
): Promise<GatewayModel[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.models
  const key = apiKey ?? process.env.AI_GATEWAY_API_KEY
  if (!key) return cache?.models ?? []
  try {
    const res = await fetch(`${gatewayBaseUrl()}/models`, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`gateway /v1/models returned ${res.status}`)
    const catalog = CatalogSchema.parse(await res.json())
    const models = catalog.data
      .map((entry) => RawModelSchema.safeParse(entry))
      .flatMap((parsed) => (parsed.success ? [parsed.data] : []))
      .filter((m) => !NON_CHAT_MODELS.has(m.id))
      .map((m) => ({
        id: m.id,
        name: m.name ?? m.id.split("/")[1] ?? m.id,
        provider: MODEL_VENDOR[m.id] ?? m.owned_by ?? providerOf(m.id),
        context: CONTEXT_WINDOWS[m.id] ?? DEFAULT_CONTEXT_WINDOW,
        // Chat models behind the gateway are treated as vision + file capable;
        // the research harness relies on attachments and tool use.
        vision: true,
        fileInput: true,
        released: m.created ?? 0,
      }))
    if (models.length > 0) cache = { at: Date.now(), models }
    return models
  } catch (err) {
    console.error("gateway model list fetch failed", err)
    return cache?.models ?? []
  }
}

/**
 * Context window for a catalog model, or undefined when unknown.
 *
 * Takes the same optional key: the agent resolves a turn's credential anyway,
 * so it can prime the catalog on a deployment that holds none of its own.
 */
export async function contextWindowFor(
  id: string,
  apiKey?: string
): Promise<number | undefined> {
  const models = await fetchGatewayModels(apiKey)
  const window = models.find((m) => m.id === id)?.context
  return window && window > 0 ? window : undefined
}
