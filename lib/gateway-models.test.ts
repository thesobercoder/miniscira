import { afterEach, describe, expect, test } from "bun:test"

import { contextWindowFor, fetchGatewayModels } from "@/lib/gateway-models"

const CATALOG = {
  data: [
    {
      id: "nex-agi/nex-n2.5-pro:free",
      name: "Nex N2.5 Pro",
      created: 1785892800,
      context_length: 262144,
      architecture: {
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
      },
      supported_parameters: ["tools", "tool_choice", "response_format"],
    },
    { id: "gpt-5.6-sol", name: "Sol", owned_by: "openai" },
    { id: "openai/gpt-image-1", name: "Image 1" },
  ],
}

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

describe("OpenRouter catalog mapping", () => {
  test("verified context, provider ids, and image exclusion", async () => {
    process.env.AI_GATEWAY_BASE_URL = "https://openrouter.ai/api/v1"
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(CATALOG), {
        status: 200,
      })) as unknown as typeof fetch

    const models = await fetchGatewayModels("test-key")
    const byId = new Map(models.map((m) => [m.id, m]))

    expect(byId.get("nex-agi/nex-n2.5-pro:free")?.context).toBe(262144)
    expect(byId.get("nex-agi/nex-n2.5-pro:free")?.provider).toBe("nex-agi")
    expect(byId.get("gpt-5.6-sol")?.context).toBe(200_000)
    expect(byId.has("openai/gpt-image-1")).toBe(false)
  })

  test("contextWindowFor returns the verified limit", async () => {
    await expect(
      contextWindowFor("nex-agi/nex-n2.5-pro:free", "test-key")
    ).resolves.toBe(262144)
  })
})
