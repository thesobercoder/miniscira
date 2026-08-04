import { beforeAll, describe, expect, test } from "bun:test"

import { open, seal } from "@/lib/secret-box"

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET ||= "test-secret-for-secret-box-round-trips"
})

describe("seal / open", () => {
  test("round-trips", () => {
    const secret = "vck_live_abcdefghijklmnopqrstuvwxyz"
    expect(open(seal(secret))).toBe(secret)
  })

  test("ciphertext never contains the plaintext", () => {
    const secret = "vck_live_abcdefghijklmnopqrstuvwxyz"
    expect(seal(secret)).not.toContain(secret)
  })

  test("the same input seals differently every time", () => {
    // A fresh IV per call, so identical keys across two users do not produce
    // identical ciphertext and become correlatable in a table dump.
    expect(seal("same")).not.toBe(seal("same"))
  })

  test("rejects a tampered ciphertext instead of returning garbage", () => {
    const sealed = seal("vck_live_abcdefghijklmnop")
    const [iv, tag, body] = sealed.split(".")
    // Flip a bit in the decoded bytes, not a base64url character. When the
    // body's length is not a multiple of 4 the final character carries only a
    // few significant bits, so swapping it can decode to identical bytes — the
    // tag then validates and `open` correctly returns the plaintext. That made
    // this test fail on roughly half of runs, since every seal uses a fresh IV.
    const bytes = Buffer.from(body, "base64url")
    bytes[0] ^= 0xff
    expect(open([iv, tag, bytes.toString("base64url")].join("."))).toBeNull()
  })

  test("rejects a tampered auth tag", () => {
    const sealed = seal("vck_live_abcdefghijklmnop")
    const [iv, tag, body] = sealed.split(".")
    const bytes = Buffer.from(tag, "base64url")
    bytes[0] ^= 0xff
    expect(open([iv, bytes.toString("base64url"), body].join("."))).toBeNull()
  })

  test("returns null on malformed input rather than throwing", () => {
    expect(open(null)).toBeNull()
    expect(open(undefined)).toBeNull()
    expect(open("")).toBeNull()
    expect(open("not-sealed")).toBeNull()
    expect(open("only.two")).toBeNull()
    expect(open("a.b.c")).toBeNull()
  })

  test("a different secret cannot open it", () => {
    const sealed = seal("vck_live_abcdefghijklmnop")
    const original = process.env.BETTER_AUTH_SECRET
    process.env.BETTER_AUTH_SECRET = "a-completely-different-secret-value"
    try {
      // Rotating the signing secret invalidates stored keys; that must read as
      // "ask again", not as a crash.
      expect(open(sealed)).toBeNull()
    } finally {
      process.env.BETTER_AUTH_SECRET = original
    }
  })
})
