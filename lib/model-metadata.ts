// Phase 3: deployment-configurable model metadata (AI_MODELS_JSON).
//
// METADATA ONLY. The live gateway catalog (/v1/models via the deployment's
// AI_GATEWAY_BASE_URL) remains the authoritative source of model AVAILABILITY.
// AI_MODELS_JSON only decorates that catalog for display: labels, picker
// order, visibility, and capability hints. It can never add a model the
// gateway does not serve, and it can never hide the fallback the agent uses.
//
// Schema-validated at startup (see lib/env-check.ts) so a malformed value
// fails boot with an actionable message instead of surprising the first user
// of the picker.

import { z } from "zod"

import { DEFAULT_CHAT_MODEL } from "./models"

const CapabilitiesSchema = z
  .object({
    vision: z.boolean().optional(),
    fileInput: z.boolean().optional(),
  })
  .optional()

const ModelMetadataEntrySchema = z.object({
  // Display override: shown in the picker and chat header instead of the
  // gateway's own name.
  name: z.string().min(1).optional(),
  // One-line picker hint (context/character), e.g. "Fast & cheap".
  hint: z.string().optional(),
  // Hide a model from the picker. Availability is unaffected — the model
  // router still accepts it if a stored pick references it.
  hidden: z.boolean().optional(),
  // Explicit picker position; models without an order keep the default
  // provider-rank sort and come after any ordered entries.
  order: z.number().optional(),
  // Capability hints shown in the picker. The gateway catalog treats chat
  // models as vision + file capable by default; these override that display.
  capabilities: CapabilitiesSchema,
})

export type ModelMetadataEntry = z.infer<typeof ModelMetadataEntrySchema>

// Keyed by model id. Unknown keys are legal (metadata may target models a
// gateway adds later); they are simply no-ops until the id appears.
export const aiModelsJsonSchema = z.record(z.string(), ModelMetadataEntrySchema)

export type AiModelsJson = z.infer<typeof aiModelsJsonSchema>

/** Parse + validate AI_MODELS_JSON; `undefined`/empty means no metadata. */
export function parseAiModelsJson(raw?: string): AiModelsJson {
  if (!raw?.trim()) return {}
  return aiModelsJsonSchema.parse(JSON.parse(raw))
}

// Parsed once per process — the value cannot change after boot, and parsing
// on every picker request would be pointless work.
let cached: AiModelsJson | undefined

export function loadModelMetadata(): AiModelsJson {
  if (!cached) cached = parseAiModelsJson(process.env.AI_MODELS_JSON)
  return cached
}

// The gateway's own catalog entry, as produced by fetchGatewayModels.
export type CatalogModel = {
  id: string
  name: string
  provider: string
  context: number
  vision: boolean
  fileInput: boolean
  released: number
}

/** A catalog model decorated with metadata; `hint` only when configured. */
export type DecoratedModel = CatalogModel & { hint?: string }

/**
 * Apply AI_MODELS_JSON metadata to a live catalog: filter hidden models,
 * override names and capability hints, pin explicit order. Availability is
 * never widened — the input is the gateway's own list.
 */
export function decorateCatalog(models: CatalogModel[]): DecoratedModel[] {
  const meta = loadModelMetadata()
  const decorate = (m: CatalogModel): DecoratedModel => {
    const entry = meta[m.id]
    if (!entry) return m
    return {
      ...m,
      name: entry.name ?? m.name,
      vision: entry.capabilities?.vision ?? m.vision,
      fileInput: entry.capabilities?.fileInput ?? m.fileInput,
      ...(entry.hint ? { hint: entry.hint } : {}),
    }
  }
  return models.filter((m) => !meta[m.id]?.hidden).map(decorate)
}

/** Order models: metadata `order` first (ascending), then provider rank. */
export function orderWithMetadata(
  models: DecoratedModel[],
  rank: (provider: string) => number
): DecoratedModel[] {
  const meta = loadModelMetadata()
  return [...models].sort((a, b) => {
    const oa = meta[a.id]?.order ?? Number.MAX_SAFE_INTEGER
    const ob = meta[b.id]?.order ?? Number.MAX_SAFE_INTEGER
    if (oa !== ob) return oa - ob
    return (
      rank(a.provider) - rank(b.provider) ||
      a.provider.localeCompare(b.provider) ||
      b.released - a.released
    )
  })
}

// Warn once per process: a default the gateway does not serve is a
// deployment-config error worth surfacing, but not fatal to startup. The
// picker cannot select it from the catalog, and a stale explicit selection
// will fail loudly rather than silently running on a different model.
let warned = false

export function warnIfDefaultMissing(models: CatalogModel[]): void {
  if (warned) return
  if (models.length > 0 && !models.some((m) => m.id === DEFAULT_CHAT_MODEL)) {
    warned = true
    console.warn(
      `[models] DEFAULT_CHAT_MODEL "${DEFAULT_CHAT_MODEL}" is not served by ` +
        "the live gateway catalog. The picker default will not be selectable, " +
        "and an explicit stale selection will fail loudly. Fix " +
        "DEFAULT_CHAT_MODEL or the gateway's model list."
    )
  }
}
