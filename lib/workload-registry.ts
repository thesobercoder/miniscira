// Single source of workload ownership: ids, capability predicates, user
// override flags, fallback policy, adapter mapping. No resolution order,
// no SQL. The order lives in provider-policy.ts.

import type { ModelCapabilities } from "@/lib/provider-policy"

export type WorkloadId =
  | "chat"
  | "research_root"
  | "researcher"
  | "lookout"
  | "image_generation"
  | "image_editing"
  | "video_generation"
  | "title"
  | "summary"
  | "compaction"
  | "memory"
  | "evaluation"

export type OverrideScope = "saved_default" | "per_action"

export type WorkloadAdapter = "chat" | "image" | "video"

export type WorkloadEntry = {
  id: WorkloadId
  // Missing capability names. Empty means the model fits.
  requires: (caps: ModelCapabilities) => string[]
  userOverridable: boolean
  // Empty when not overridable.
  overrideScopes: OverrideScope[]
  // False means fail loudly instead of trying fallbacks.
  fallbackAllowed: boolean
  adapter: WorkloadAdapter
}

function textInOut(caps: ModelCapabilities, missing: string[]): void {
  if (!caps.input.has("text")) missing.push("input:text")
  if (!caps.output.has("text")) missing.push("output:text")
}

function chatBase(caps: ModelCapabilities): string[] {
  const missing: string[] = []
  if (!caps.input.has("text")) missing.push("input:text")
  if (!caps.input.has("image")) missing.push("input:image")
  if (!caps.output.has("text")) missing.push("output:text")
  if (!caps.streaming) missing.push("streaming")
  return missing
}

function researchRootCaps(caps: ModelCapabilities): string[] {
  const missing: string[] = []
  textInOut(caps, missing)
  if (!caps.streaming) missing.push("streaming")
  if (!caps.tools) missing.push("tools")
  return missing
}

// Researcher subagents and Lookouts need text plus tools. The PRD does not
// require streaming or image input for these workloads.
function toolCaps(caps: ModelCapabilities): string[] {
  const missing: string[] = []
  textInOut(caps, missing)
  if (!caps.tools) missing.push("tools")
  return missing
}

function structuredCaps(caps: ModelCapabilities): string[] {
  const missing: string[] = []
  textInOut(caps, missing)
  if (!caps.structuredOutput) missing.push("structured-output")
  return missing
}

function contextCaps(caps: ModelCapabilities): string[] {
  const missing: string[] = []
  textInOut(caps, missing)
  if (caps.contextWindowTokens === null) missing.push("known-context-window")
  return missing
}

const BOTH_SCOPES: OverrideScope[] = ["saved_default", "per_action"]

export const WORKLOADS: Record<WorkloadId, WorkloadEntry> = {
  chat: {
    id: "chat",
    requires: chatBase,
    userOverridable: true,
    overrideScopes: BOTH_SCOPES,
    fallbackAllowed: true,
    adapter: "chat",
  },
  research_root: {
    id: "research_root",
    requires: researchRootCaps,
    userOverridable: true,
    overrideScopes: BOTH_SCOPES,
    fallbackAllowed: false,
    adapter: "chat",
  },
  researcher: {
    id: "researcher",
    requires: toolCaps,
    userOverridable: true,
    overrideScopes: BOTH_SCOPES,
    fallbackAllowed: false,
    adapter: "chat",
  },
  lookout: {
    id: "lookout",
    requires: toolCaps,
    userOverridable: true,
    overrideScopes: BOTH_SCOPES,
    fallbackAllowed: true,
    adapter: "chat",
  },
  image_generation: {
    id: "image_generation",
    requires: (caps) => {
      const missing: string[] = []
      if (!caps.input.has("text")) missing.push("input:text")
      if (!caps.imageGeneration) missing.push("image-generation")
      if (!caps.output.has("image")) missing.push("output:image")
      return missing
    },
    userOverridable: true,
    overrideScopes: BOTH_SCOPES,
    fallbackAllowed: false,
    adapter: "image",
  },
  image_editing: {
    id: "image_editing",
    requires: (caps) => {
      const missing: string[] = []
      if (!caps.input.has("text")) missing.push("input:text")
      if (!caps.imageEditing) missing.push("image-editing")
      if (!caps.input.has("image")) missing.push("input:image")
      if (!caps.output.has("image")) missing.push("output:image")
      return missing
    },
    userOverridable: true,
    overrideScopes: BOTH_SCOPES,
    fallbackAllowed: false,
    adapter: "image",
  },
  video_generation: {
    id: "video_generation",
    requires: (caps) => {
      const missing: string[] = []
      if (!caps.input.has("text")) missing.push("input:text")
      if (!caps.videoGeneration) missing.push("video-generation")
      if (!caps.output.has("video")) missing.push("output:video")
      return missing
    },
    userOverridable: true,
    overrideScopes: BOTH_SCOPES,
    fallbackAllowed: false,
    adapter: "video",
  },
  title: {
    id: "title",
    requires: structuredCaps,
    userOverridable: false,
    overrideScopes: [],
    fallbackAllowed: false,
    adapter: "chat",
  },
  summary: {
    id: "summary",
    requires: contextCaps,
    userOverridable: false,
    overrideScopes: [],
    fallbackAllowed: false,
    adapter: "chat",
  },
  compaction: {
    id: "compaction",
    requires: contextCaps,
    userOverridable: false,
    overrideScopes: [],
    fallbackAllowed: false,
    adapter: "chat",
  },
  memory: {
    id: "memory",
    requires: structuredCaps,
    userOverridable: false,
    overrideScopes: [],
    fallbackAllowed: false,
    adapter: "chat",
  },
  evaluation: {
    id: "evaluation",
    requires: structuredCaps,
    userOverridable: false,
    overrideScopes: [],
    fallbackAllowed: false,
    adapter: "chat",
  },
}

export function isUserOverridable(workload: WorkloadId): boolean {
  return WORKLOADS[workload].userOverridable
}

export function adapterFor(workload: WorkloadId): WorkloadAdapter {
  return WORKLOADS[workload].adapter
}
