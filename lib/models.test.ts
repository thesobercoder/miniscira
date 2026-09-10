import { describe, expect, test } from "bun:test"

import { providerLabel, providerOf, shortModelName } from "@/lib/models"

describe("providerOf", () => {
  test("unknown slash prefix yields its own vendor", () => {
    expect(providerOf("mystery-shop/mystery-model")).toBe("mystery-shop")
  })

  test("slash prefix is lowercased", () => {
    expect(providerOf("OpenAI/gpt-5")).toBe("openai")
  })

  test("bare unknown id yields unknown", () => {
    expect(providerOf("bare-unknown-model")).toBe("unknown")
  })
})

describe("providerLabel", () => {
  test("falls back to the capitalized slug for unmapped vendors", () => {
    expect(providerLabel("mystery-shop")).toBe("Mystery-shop")
    expect(providerLabel("unknown")).toBe("Unknown")
  })
})

describe("shortModelName", () => {
  test("prettifies the id tail only", () => {
    expect(shortModelName("openai/gpt-5")).toBe("GPT 5")
    expect(shortModelName("bare-model-name")).toBe("Bare Model Name")
  })
})
