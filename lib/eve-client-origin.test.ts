import { describe, expect, test } from "bun:test"

import { eveClientOrigin } from "@/lib/eve-client-origin"

describe("eveClientOrigin", () => {
  test("uses the public app origin outside self-hosted production", () => {
    expect(
      eveClientOrigin({
        appOrigin: "https://app.example.com",
        nodeEnv: "development",
        productionPort: undefined,
        vercel: undefined,
      })
    ).toBe("https://app.example.com")
    expect(
      eveClientOrigin({
        appOrigin: "https://app.example.com",
        nodeEnv: "production",
        productionPort: undefined,
        vercel: "1",
      })
    ).toBe("https://app.example.com")
  })

  test("uses the local Eve production port when self-hosted", () => {
    expect(
      eveClientOrigin({
        appOrigin: "http://umbrel.local:8325",
        nodeEnv: "production",
        productionPort: undefined,
        vercel: undefined,
      })
    ).toBe("http://127.0.0.1:4274")
    expect(
      eveClientOrigin({
        appOrigin: "http://umbrel.local:8325",
        nodeEnv: "production",
        productionPort: "5000",
        vercel: undefined,
      })
    ).toBe("http://127.0.0.1:5000")
  })
})
