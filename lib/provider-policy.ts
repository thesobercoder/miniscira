// Pure provider policy: capability shapes, catalog normalization, and the
// single workload resolver. No DB, no fetch, no gateway imports. Each
// function takes plain inputs and returns plain outputs.

import { WORKLOADS, type WorkloadId } from "@/lib/workload-registry"

export type Modality = "text" | "image" | "audio" | "video"

export type ModelCapabilities = {
  input: ReadonlySet<Modality>
  output: ReadonlySet<Modality>
  streaming: boolean
  tools: boolean
  structuredOutput: boolean
  imageGeneration: boolean
  imageEditing: boolean
  videoGeneration: boolean
  // Null means unknown. Never replaced with a guess.
  contextWindowTokens: number | null
}

export type CapabilitySource =
  | "provider"
  | "administrator_override"
  | "verified_probe"

export type AllowedModel = {
  // Provider value. Never replaced with another id.
  modelId: string
  displayName: string
  enabled: boolean
  capabilities: ModelCapabilities
  // Worst case per model: override beats probe beats provider.
  capabilitySource: CapabilitySource
}

export type CapabilityOverride = {
  modelId: string
  patch: Partial<ModelCapabilities>
  // False until a live probe passes.
  verified: boolean
  updatedAt: string
}

export type WorkloadAssignment = {
  workload: WorkloadId
  primaryModelId: string
  fallbackModelIds: string[]
}

export type UserPreference = {
  userId: string
  workload: WorkloadId
  modelId: string
  updatedAt: string
}

export type ResolveSource =
  | "action_override"
  | "user_preference"
  | "admin_primary"
  | "admin_fallback"

export type ResolveResult = {
  modelId: string
  capabilities: ModelCapabilities
  // P0 always shares the deployment key. BYOK picks a key at dispatch later.
  credential: { kind: "shared_provider" } | { kind: "user_key" }
  source: ResolveSource
}

// Typed failure for resolution. Missing names match requires() output.
export class WorkloadResolutionError extends Error {
  readonly workload: WorkloadId
  readonly missing: string[]

  constructor(workload: WorkloadId, missing: string[]) {
    super(`missing-capabilities for ${workload}: ${missing.join(", ")}`)
    this.name = "WorkloadResolutionError"
    this.workload = workload
    this.missing = missing
  }
}

// Raw OpenRouter /models entry. Fields stay loose: the wire shape drifts,
// and narrowing happens below instead of at the fetch boundary.
export type OpenRouterModelRaw = {
  id: string
  name?: string
  architecture?: {
    input_modalities?: unknown
    output_modalities?: unknown
  }
  context_length?: unknown
  supported_parameters?: unknown
}

// Raw generic OpenAI-compatible entry. Only reachability is known until an
// admin adds an override.
export type GenericModelRaw = {
  id: string
  name?: string
  // True when /chat/completions answers for this model.
  chatCompletionsReachable?: boolean
  inputModalities?: unknown
  outputModalities?: unknown
}

const KNOWN_MODALITIES: ReadonlySet<string> = new Set([
  "text",
  "image",
  "audio",
  "video",
])

// Null means the value names something unknown. Callers drop the model.
function parseModalities(
  value: unknown,
  fallback: Modality[]
): ReadonlySet<Modality> | null {
  if (value === undefined || value === null) return new Set(fallback)
  if (!Array.isArray(value)) return null
  const out = new Set<Modality>()
  for (const entry of value) {
    if (typeof entry !== "string") return null
    const lower = entry.toLowerCase()
    if (!KNOWN_MODALITIES.has(lower)) return null
    out.add(lower as Modality)
  }
  return out
}

function paramSet(value: unknown): ReadonlySet<string> {
  if (!Array.isArray(value)) return new Set()
  const out = new Set<string>()
  for (const entry of value) {
    if (typeof entry === "string") out.add(entry.toLowerCase())
  }
  return out
}

function contextTokens(value: unknown): number | null {
  if (typeof value !== "number") return null
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.floor(value)
}

// Normalize one OpenRouter catalog entry. Null means rejected: either the
// id is unusable or a modality string is unknown. Unknown strings never
// become a guess.
export function normalizeOpenRouter(
  raw: OpenRouterModelRaw
): AllowedModel | null {
  if (!raw || typeof raw.id !== "string" || raw.id.length === 0) return null
  const input = parseModalities(raw.architecture?.input_modalities, ["text"])
  const output = parseModalities(raw.architecture?.output_modalities, ["text"])
  if (input === null || output === null) return null
  const params = paramSet(raw.supported_parameters)
  const tools = params.has("tools") || params.has("tool_choice")
  const structuredOutput =
    params.has("structured_outputs") ||
    params.has("structured-outputs") ||
    params.has("structured-output") ||
    params.has("response_format") ||
    params.has("response-format") ||
    params.has("json_schema")
  return {
    modelId: raw.id,
    displayName: raw.name ?? raw.id,
    enabled: true,
    capabilities: {
      input,
      output,
      // OpenRouter chat completions stream unless a probe says otherwise.
      streaming: output.has("text"),
      tools,
      structuredOutput,
      imageGeneration: output.has("image"),
      // Editing needs an explicit override or probe. Modalities alone
      // cannot tell generation apart from editing.
      imageEditing: false,
      videoGeneration: output.has("video"),
      contextWindowTokens: contextTokens(raw.context_length),
    },
    capabilitySource: "provider",
  }
}

// Normalize one generic entry. Reachability gives text in and out only.
// Everything else stays false or null until an override provides it.
export function normalizeGeneric(
  raw: GenericModelRaw,
  overrides?: CapabilityOverride | readonly CapabilityOverride[]
): AllowedModel | null {
  if (!raw || typeof raw.id !== "string" || raw.id.length === 0) return null
  const reachable = raw.chatCompletionsReachable === true
  const fallback: Modality[] = reachable ? ["text"] : []
  const input = parseModalities(raw.inputModalities, fallback)
  const output = parseModalities(raw.outputModalities, fallback)
  if (input === null || output === null) return null
  let capabilities: ModelCapabilities = {
    input,
    output,
    streaming: false,
    tools: false,
    structuredOutput: false,
    imageGeneration: false,
    imageEditing: false,
    videoGeneration: false,
    contextWindowTokens: null,
  }
  let capabilitySource: CapabilitySource = "provider"
  const list = Array.isArray(overrides)
    ? overrides
    : overrides === undefined
      ? []
      : [overrides]
  const override = list.find((item) => item.modelId === raw.id)
  if (override) {
    capabilities = { ...capabilities, ...override.patch }
    capabilitySource = override.verified
      ? "verified_probe"
      : "administrator_override"
  }
  return {
    modelId: raw.id,
    displayName: raw.name ?? raw.id,
    enabled: true,
    capabilities,
    capabilitySource,
  }
}

// The one typed resolver. Order: action override, user preference, admin
// primary, admin fallbacks. The first entry that is enabled and satisfies
// requires() wins. A stale saved preference is skipped, never deleted: this
// function cannot mutate the prefs map it reads.
export function resolveWorkload(
  workload: WorkloadId,
  catalog: Map<string, AllowedModel>,
  assignments: Map<WorkloadId, WorkloadAssignment>,
  prefs: Map<WorkloadId, string>,
  input: { actionOverrideModelId?: string }
): ResolveResult {
  const entry = WORKLOADS[workload]
  if (!entry) {
    throw new WorkloadResolutionError(workload, [
      `unknown-workload:${String(workload)}`,
    ])
  }

  // A per-action pick is explicit, so a miss fails loudly instead of
  // swapping in another model silently.
  if (input.actionOverrideModelId !== undefined) {
    const modelId = input.actionOverrideModelId
    const model = catalog.get(modelId)
    if (!model?.enabled) {
      throw new WorkloadResolutionError(workload, [
        `unavailable-model:${modelId}`,
      ])
    }
    const missing = entry.requires(model.capabilities)
    if (missing.length > 0) {
      throw new WorkloadResolutionError(workload, missing)
    }
    return {
      modelId,
      capabilities: model.capabilities,
      credential: { kind: "shared_provider" },
      source: "action_override",
    }
  }

  const preferred = prefs.get(workload)
  if (preferred !== undefined) {
    const model = catalog.get(preferred)
    if (model?.enabled && entry.requires(model.capabilities).length === 0) {
      return {
        modelId: preferred,
        capabilities: model.capabilities,
        credential: { kind: "shared_provider" },
        source: "user_preference",
      }
    }
  }

  const assignment = assignments.get(workload)
  if (!assignment) {
    throw new WorkloadResolutionError(workload, [`no-assignment:${workload}`])
  }
  const primary = catalog.get(assignment.primaryModelId)
  if (primary?.enabled && entry.requires(primary.capabilities).length === 0) {
    return {
      modelId: assignment.primaryModelId,
      capabilities: primary.capabilities,
      credential: { kind: "shared_provider" },
      source: "admin_primary",
    }
  }
  const primaryMissing = primary?.enabled
    ? entry.requires(primary.capabilities)
    : [`unavailable-model:${assignment.primaryModelId}`]

  // Some workloads must fail loudly instead of trying fallbacks.
  if (!entry.fallbackAllowed) {
    throw new WorkloadResolutionError(workload, primaryMissing)
  }
  for (const modelId of assignment.fallbackModelIds) {
    const model = catalog.get(modelId)
    if (model?.enabled && entry.requires(model.capabilities).length === 0) {
      return {
        modelId,
        capabilities: model.capabilities,
        credential: { kind: "shared_provider" },
        source: "admin_fallback",
      }
    }
  }
  throw new WorkloadResolutionError(workload, primaryMissing)
}
