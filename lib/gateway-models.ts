// Server-side: the AI Gateway model catalog, cached in memory for an hour.
// Shared by /api/models (the picker's list) and the model router (validation),
// so a picked id is always checked against the live catalog.

import { z } from "zod"
import { providerOf } from "./models"

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
 * The gateway's catalog is third-party data, so it's parsed rather than
 * asserted. `id` is required here (an entry without one is unusable), which is
 * what lets the mapping below read it without a non-null assertion; every other
 * field is optional and defaulted. Unknown entries are dropped, not thrown on —
 * one malformed model shouldn't empty the whole picker.
 */
const RawModelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  type: z.string().optional(),
  owned_by: z.string().optional(),
  context_window: z.number().optional(),
  released: z.number().optional(),
  tags: z.array(z.string()).default([]),
})

const CatalogSchema = z.object({
  data: z.array(z.unknown()).default([]),
})

/**
 * Shared across users on purpose.
 *
 * The catalog is a property of the gateway, not of whose key fetched it — every
 * key sees the same list of tool-capable models. Caching per user would mean
 * one upstream request per signed-in person per hour for identical data.
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
    const res = await fetch("https://ai-gateway.vercel.sh/v1/models", {
      headers: { authorization: `Bearer ${key}` },
    })
    if (!res.ok) throw new Error(`gateway /v1/models returned ${res.status}`)
    const catalog = CatalogSchema.parse(await res.json())
    const models = catalog.data
      .map((entry) => RawModelSchema.safeParse(entry))
      .flatMap((parsed) => (parsed.success ? [parsed.data] : []))
      // The research harness needs tool calling; anything else would silently break it.
      .filter((m) => m.type === "language" && m.tags.includes("tool-use"))
      .map((m) => ({
        id: m.id,
        name: m.name ?? m.id.split("/")[1],
        provider: m.owned_by ?? providerOf(m.id),
        context: m.context_window ?? 0,
        vision: m.tags.includes("vision"),
        fileInput: m.tags.includes("file-input"),
        released: m.released ?? 0,
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
