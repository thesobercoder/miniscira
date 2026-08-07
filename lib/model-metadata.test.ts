import { describe, expect, test } from "bun:test"

import {
  type CatalogModel,
  decorateCatalog,
  orderWithMetadata,
  parseAiModelsJson,
  warnIfDefaultMissing,
} from "@/lib/model-metadata"
import { resolveDefaultChatModel } from "@/lib/models"

// Decorated-catalog helpers read AI_MODELS_JSON through a per-process
// singleton, so the value must be in place before the first decorated call.
// bun test isolates files, so this cannot leak into other suites.
const META = {
  "gpt-5.6-sol": {
    name: "Sol (MoA)",
    hint: "Flagship reasoning",
    order: 1,
    capabilities: { vision: true, fileInput: false },
  },
  "deepseek-v4-flash": { hidden: true },
  "qwen3.8-max": { name: "Qwen 3.8 Max" },
}
process.env.AI_MODELS_JSON = JSON.stringify(META)

const CATALOG: CatalogModel[] = [
  {
    id: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    provider: "openai",
    context: 200_000,
    vision: true,
    fileInput: true,
    released: 10,
  },
  {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash",
    provider: "google",
    context: 200_000,
    vision: true,
    fileInput: true,
    released: 5,
  },
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    provider: "deepseek",
    context: 200_000,
    vision: true,
    fileInput: true,
    released: 8,
  },
  {
    id: "qwen3.8-max",
    name: "Qwen 3.8 Max",
    provider: "alibaba",
    context: 200_000,
    vision: true,
    fileInput: true,
    released: 3,
  },
]

describe("parseAiModelsJson", () => {
  test("empty or undefined means no metadata", () => {
    expect(parseAiModelsJson()).toEqual({})
    expect(parseAiModelsJson("")).toEqual({})
    expect(parseAiModelsJson("   ")).toEqual({})
  })

  test("parses a valid object keyed by model id", () => {
    const parsed = parseAiModelsJson(
      '{"gpt-5.6-sol":{"name":"Sol","order":1,"hidden":true}}'
    )
    expect(parsed["gpt-5.6-sol"]).toEqual({
      name: "Sol",
      order: 1,
      hidden: true,
    })
  })

  test("rejects invalid JSON", () => {
    expect(() => parseAiModelsJson("{nope")).toThrow()
  })

  test("rejects a non-object document", () => {
    expect(() => parseAiModelsJson("[1,2,3]")).toThrow()
    expect(() => parseAiModelsJson('"str"')).toThrow()
  })

  test("rejects entries with unknown or mistyped keys", () => {
    expect(() =>
      parseAiModelsJson('{"gpt-5.6-sol":{"order":"first"}}')
    ).toThrow()
    expect(() =>
      parseAiModelsJson('{"gpt-5.6-sol":{"capabilities":{"vision":"yes"}}}')
    ).toThrow()
  })

  test("rejects a non-finite order", () => {
    expect(() => parseAiModelsJson('{"gpt-5.6-sol":{"order":1e309}}')).toThrow()
  })
})

describe("decorateCatalog", () => {
  test("overrides names and hints, never widens availability", () => {
    const out = decorateCatalog(CATALOG)
    const sol = out.find((m) => m.id === "gpt-5.6-sol")
    expect(sol?.name).toBe("Sol (MoA)")
    expect(sol?.hint).toBe("Flagship reasoning")
    // Availability is the gateway's: metadata cannot add models.
    expect(out.some((m) => m.id === "does-not-exist")).toBe(false)
  })

  test("hides models marked hidden", () => {
    const out = decorateCatalog(CATALOG)
    expect(out.some((m) => m.id === "deepseek-v4-flash")).toBe(false)
    expect(out.some((m) => m.id === "qwen3.8-max")).toBe(true)
  })

  test("overrides capability display hints only", () => {
    const sol = decorateCatalog(CATALOG).find((m) => m.id === "gpt-5.6-sol")
    expect(sol?.vision).toBe(true)
    expect(sol?.fileInput).toBe(false)
    // Unconfigured models keep the gateway's defaults.
    const gem = decorateCatalog(CATALOG).find((m) => m.id === "gemini-3-flash")
    expect(gem?.fileInput).toBe(true)
  })

  test("leaves unconfigured models untouched", () => {
    const out = decorateCatalog(CATALOG)
    const gem = out.find((m) => m.id === "gemini-3-flash")
    expect(gem).toEqual(CATALOG.find((m) => m.id === "gemini-3-flash"))
  })
})

describe("orderWithMetadata", () => {
  test("pinned order sorts first, ascending", () => {
    const rank = (p: string) => (p === "openai" ? 0 : 1)
    const ordered = orderWithMetadata(decorateCatalog(CATALOG), rank)
    expect(ordered[0].id).toBe("gpt-5.6-sol")
  })

  test("unconfigured models keep the provider-rank fallback", () => {
    const rank = (p: string) => (p === "openai" ? 0 : p === "google" ? 1 : 2)
    const ordered = orderWithMetadata(
      decorateCatalog(CATALOG).filter((m) => m.id !== "gpt-5.6-sol"),
      rank
    )
    expect(ordered.map((m) => m.id)).toEqual(["gemini-3-flash", "qwen3.8-max"])
  })
})

describe("warnIfDefaultMissing", () => {
  test("stays silent when the default is served", () => {
    const spy = console.warn
    const calls: unknown[][] = []
    console.warn = (...args: unknown[]) => {
      calls.push(args)
    }
    try {
      warnIfDefaultMissing(CATALOG)
      expect(calls.length).toBe(0)
    } finally {
      console.warn = spy
    }
  })

  test("stays silent on an empty catalog (gateway unreachable)", () => {
    const spy = console.warn
    const calls: unknown[][] = []
    console.warn = (...args: unknown[]) => {
      calls.push(args)
    }
    try {
      warnIfDefaultMissing([])
      expect(calls.length).toBe(0)
    } finally {
      console.warn = spy
    }
  })

  // Runs last: the module's warned-flag is per-process, and this test arms it.
  test("warns when the default is absent from the live catalog, once", () => {
    const spy = console.warn
    const calls: unknown[][] = []
    console.warn = (...args: unknown[]) => {
      calls.push(args)
    }
    try {
      warnIfDefaultMissing(CATALOG.filter((m) => m.id !== "gpt-5.6-sol"))
      expect(calls.length).toBe(1)
      expect(String(calls[0][0])).toContain("gpt-5.6-sol")
      // Warns only once per process.
      warnIfDefaultMissing(CATALOG.filter((m) => m.id !== "gpt-5.6-sol"))
      expect(calls.length).toBe(1)
    } finally {
      console.warn = spy
    }
  })
})

describe("resolveDefaultChatModel", () => {
  const clean = () => {
    delete process.env.DEFAULT_CHAT_MODEL
    delete process.env.NEXT_PUBLIC_DEFAULT_CHAT_MODEL
  }

  test("falls back to the built-in default when unset", () => {
    clean()
    expect(resolveDefaultChatModel()).toBe("gpt-5.6-sol")
  })

  test("uses a valid runtime DEFAULT_CHAT_MODEL", () => {
    clean()
    process.env.DEFAULT_CHAT_MODEL = "deepseek-v4-pro"
    expect(resolveDefaultChatModel()).toBe("deepseek-v4-pro")
  })

  test("runtime value wins over the build-time NEXT_PUBLIC value", () => {
    clean()
    process.env.DEFAULT_CHAT_MODEL = "deepseek-v4-pro"
    process.env.NEXT_PUBLIC_DEFAULT_CHAT_MODEL = "gpt-5.6-luna"
    expect(resolveDefaultChatModel()).toBe("deepseek-v4-pro")
  })

  test("uses NEXT_PUBLIC value when only it is set (client bundle)", () => {
    clean()
    process.env.NEXT_PUBLIC_DEFAULT_CHAT_MODEL = "gpt-5.6-luna"
    expect(resolveDefaultChatModel()).toBe("gpt-5.6-luna")
  })

  test("rejects an invalid value with a warning and falls back", () => {
    clean()
    const spy = console.warn
    const calls: unknown[][] = []
    console.warn = (...args: unknown[]) => {
      calls.push(args)
    }
    try {
      process.env.DEFAULT_CHAT_MODEL = "not a model id!"
      expect(resolveDefaultChatModel()).toBe("gpt-5.6-sol")
      expect(calls.length).toBe(1)
    } finally {
      console.warn = spy
      clean()
    }
  })
})
