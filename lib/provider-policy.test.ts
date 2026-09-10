import { describe, expect, test } from "bun:test"

import {
  type AllowedModel,
  type ModelCapabilities,
  type WorkloadAssignment,
  normalizeGeneric,
  normalizeOpenRouter,
  resolveWorkload,
  WorkloadResolutionError,
} from "@/lib/provider-policy"
import type { WorkloadId } from "@/lib/workload-registry"

function chatCaps(overrides?: Partial<ModelCapabilities>): ModelCapabilities {
  return {
    input: new Set(["text", "image"]),
    output: new Set(["text"]),
    streaming: true,
    tools: false,
    structuredOutput: false,
    imageGeneration: false,
    imageEditing: false,
    videoGeneration: false,
    contextWindowTokens: 128000,
    ...overrides,
  }
}

function model(
  id: string,
  caps: ModelCapabilities,
  enabled = true
): AllowedModel {
  return {
    modelId: id,
    displayName: id,
    enabled,
    capabilities: caps,
    capabilitySource: "provider",
  }
}

function assignment(
  workload: WorkloadId,
  primaryModelId: string,
  fallbackModelIds: string[] = []
): WorkloadAssignment {
  return { workload, primaryModelId, fallbackModelIds }
}

describe("normalizeOpenRouter", () => {
  test("maps modalities, context, and parameter hints", () => {
    const out = normalizeOpenRouter({
      id: "vendor/big-model",
      name: "Big Model",
      architecture: {
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
      },
      context_length: 200000,
      supported_parameters: ["temperature", "tools", "response_format"],
    })
    expect(out?.modelId).toBe("vendor/big-model")
    expect(out?.displayName).toBe("Big Model")
    expect(out?.enabled).toBe(true)
    expect(out?.capabilitySource).toBe("provider")
    expect(out?.capabilities.input).toEqual(new Set(["text", "image"]))
    expect(out?.capabilities.output).toEqual(new Set(["text"]))
    expect(out?.capabilities.contextWindowTokens).toBe(200000)
    expect(out?.capabilities.tools).toBe(true)
    expect(out?.capabilities.structuredOutput).toBe(true)
    expect(out?.capabilities.streaming).toBe(true)
  })

  test("keeps unknown context as null instead of guessing", () => {
    const out = normalizeOpenRouter({ id: "vendor/small" })
    expect(out?.capabilities.contextWindowTokens).toBeNull()
    expect(out?.capabilities.input).toEqual(new Set(["text"]))
    expect(out?.capabilities.output).toEqual(new Set(["text"]))
  })
})

describe("normalizeGeneric", () => {
  test("reachable model gets text in and out only", () => {
    const out = normalizeGeneric({
      id: "local/model",
      chatCompletionsReachable: true,
    })
    expect(out?.capabilities.input).toEqual(new Set(["text"]))
    expect(out?.capabilities.output).toEqual(new Set(["text"]))
    expect(out?.capabilities.tools).toBe(false)
    expect(out?.capabilities.streaming).toBe(false)
    expect(out?.capabilities.contextWindowTokens).toBeNull()
    expect(out?.capabilitySource).toBe("provider")
  })

  test("override fills the rest and marks the source", () => {
    const out = normalizeGeneric(
      { id: "local/model", chatCompletionsReachable: true },
      {
        modelId: "local/model",
        patch: { tools: true, streaming: true },
        verified: false,
        updatedAt: "2026-09-10T00:00:00Z",
      }
    )
    expect(out?.capabilities.tools).toBe(true)
    expect(out?.capabilities.streaming).toBe(true)
    expect(out?.capabilitySource).toBe("administrator_override")
  })

  test("verified override marks a probe source", () => {
    const out = normalizeGeneric(
      { id: "local/model", chatCompletionsReachable: true },
      {
        modelId: "local/model",
        patch: { tools: true },
        verified: true,
        updatedAt: "2026-09-10T00:00:00Z",
      }
    )
    expect(out?.capabilitySource).toBe("verified_probe")
  })
})

describe("reject unknown caps", () => {
  test("openrouter entry with unknown modality is dropped", () => {
    expect(
      normalizeOpenRouter({
        id: "vendor/odd",
        architecture: {
          input_modalities: ["text", "telepathy"],
          output_modalities: ["text"],
        },
        context_length: 8000,
      })
    ).toBeNull()
  })

  test("generic entry with unknown modality is dropped", () => {
    expect(
      normalizeGeneric({
        id: "local/odd",
        chatCompletionsReachable: true,
        outputModalities: ["text", "smell"],
      })
    ).toBeNull()
  })
})

describe("resolveWorkload", () => {
  test("resolves the admin primary", () => {
    const catalog = new Map([
      ["a", model("a", chatCaps())],
      ["b", model("b", chatCaps())],
    ])
    const out = resolveWorkload(
      "chat",
      catalog,
      new Map([["chat", assignment("chat", "a", ["b"])]]),
      new Map(),
      {}
    )
    expect(out.modelId).toBe("a")
    expect(out.source).toBe("admin_primary")
  })

  test("falls back when the primary is disabled", () => {
    const catalog = new Map([
      ["a", model("a", chatCaps(), false)],
      ["b", model("b", chatCaps())],
    ])
    const out = resolveWorkload(
      "chat",
      catalog,
      new Map([["chat", assignment("chat", "a", ["b"])]]),
      new Map(),
      {}
    )
    expect(out.modelId).toBe("b")
    expect(out.source).toBe("admin_fallback")
  })

  test("prefers a compatible saved default", () => {
    const catalog = new Map([
      ["a", model("a", chatCaps())],
      ["b", model("b", chatCaps())],
    ])
    const out = resolveWorkload(
      "chat",
      catalog,
      new Map([["chat", assignment("chat", "a", ["b"])]]),
      new Map([["chat", "b"]]),
      {}
    )
    expect(out.modelId).toBe("b")
    expect(out.source).toBe("user_preference")
  })

  test("honors a compatible per-action override", () => {
    const catalog = new Map([
      ["a", model("a", chatCaps())],
      ["b", model("b", chatCaps())],
    ])
    const out = resolveWorkload(
      "chat",
      catalog,
      new Map([["chat", assignment("chat", "a")]]),
      new Map([["chat", "a"]]),
      { actionOverrideModelId: "b" }
    )
    expect(out.modelId).toBe("b")
    expect(out.source).toBe("action_override")
  })

  test("rejects an incompatible assignment with missing list", () => {
    const catalog = new Map([
      ["plain", model("plain", chatCaps({ structuredOutput: false }))],
    ])
    let caught: WorkloadResolutionError | null = null
    try {
      resolveWorkload(
        "title",
        catalog,
        new Map([["title", assignment("title", "plain")]]),
        new Map(),
        {}
      )
    } catch (error) {
      caught = error as WorkloadResolutionError
    }
    expect(caught).toBeInstanceOf(WorkloadResolutionError)
    expect(caught?.workload).toBe("title")
    expect(caught?.missing).toContain("structured-output")
  })

  test("skips a stale saved default but keeps it stored", () => {
    const catalog = new Map([
      ["stale", model("stale", chatCaps({ streaming: false }))],
      ["a", model("a", chatCaps())],
    ])
    const prefs = new Map<WorkloadId, string>([["chat", "stale"]])
    const out = resolveWorkload(
      "chat",
      catalog,
      new Map([["chat", assignment("chat", "a")]]),
      prefs,
      {}
    )
    expect(out.modelId).toBe("a")
    expect(out.source).toBe("admin_primary")
    expect(prefs.get("chat")).toBe("stale")
  })
})
