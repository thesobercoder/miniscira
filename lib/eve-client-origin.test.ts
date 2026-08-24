import { describe, expect, test } from "bun:test"

import { eveClientOrigin } from "@/lib/eve-client-origin"

describe("eveClientOrigin", () => {
  test("uses the public app origin outside self-hosted production", () => {
    expect(
      eveClientOrigin({
        appOrigin: "https://app.example.com",
        nodeEnv: "development",
        productionOrigin: undefined,
        productionPort: undefined,
        vercel: undefined,
      })
    ).toBe("https://app.example.com")
    expect(
      eveClientOrigin({
        appOrigin: "https://app.example.com",
        nodeEnv: "production",
        productionOrigin: undefined,
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
        productionOrigin: undefined,
        productionPort: undefined,
        vercel: undefined,
      })
    ).toBe("http://127.0.0.1:4274")
    expect(
      eveClientOrigin({
        appOrigin: "http://umbrel.local:8325",
        nodeEnv: "production",
        productionOrigin: undefined,
        productionPort: "5000",
        vercel: undefined,
      })
    ).toBe("http://127.0.0.1:5000")
  })

  test("uses the configured remote Eve production origin", () => {
    expect(
      eveClientOrigin({
        appOrigin: "https://app.example.com",
        nodeEnv: "production",
        productionOrigin: "https://eve.example.com/base/path",
        productionPort: undefined,
        vercel: undefined,
      })
    ).toBe("https://eve.example.com")
  })

  test("rejects invalid local Eve production ports", () => {
    for (const productionPort of ["abc", "4274x", "0", "-1", "70000"]) {
      expect(() =>
        eveClientOrigin({
          appOrigin: "http://umbrel.local:8325",
          nodeEnv: "production",
          productionOrigin: undefined,
          productionPort,
          vercel: undefined,
        })
      ).toThrow(
        "EVE_NEXT_PRODUCTION_PORT must be an integer between 1 and 65535."
      )
    }
  })
})
