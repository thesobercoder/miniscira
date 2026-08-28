import { describe, expect, test } from "bun:test"

import {
  detectImageMediaType,
  isClaimedImageUpload,
} from "@/lib/image-signature"

const ascii = (value: string) =>
  [...value].map((character) => character.charCodeAt(0))

function isoImage(...brands: string[]): Uint8Array {
  const size = 16 + Math.max(0, brands.length - 1) * 4
  return new Uint8Array([
    0,
    0,
    0,
    size,
    ...ascii("ftyp"),
    ...ascii(brands[0] ?? "    "),
    0,
    0,
    0,
    0,
    ...brands.slice(1).flatMap(ascii),
  ])
}

const SIGNATURES = [
  ["image/jpeg", [0xff, 0xd8, 0xff, 0xe0]],
  ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ["image/gif", ascii("GIF89a")],
  ["image/webp", [...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP")]],
  ["image/bmp", ascii("BM")],
  ["image/tiff", [0x49, 0x49, 0x2a, 0x00]],
  ["image/tiff", [0x4d, 0x4d, 0x00, 0x2a]],
  ["image/tiff", [0x49, 0x49, 0x2b, 0x00]],
  ["image/tiff", [0x4d, 0x4d, 0x00, 0x2b]],
] as const

describe("image signature detection", () => {
  test("detects the accepted non-ISO image families", () => {
    for (const [mediaType, bytes] of SIGNATURES) {
      expect(detectImageMediaType(new Uint8Array(bytes))).toBe(mediaType)
    }
  })

  test("detects AVIF from major and compatible brands with variable box size", () => {
    expect(detectImageMediaType(isoImage("avif"))).toBe("image/avif")
    expect(detectImageMediaType(isoImage("mif1", "avif"))).toBe("image/avif")
    expect(detectImageMediaType(isoImage("avis", "mif1", "miaf"))).toBe(
      "image/avif"
    )
  })

  test("detects common HEIC brands", () => {
    for (const brand of [
      "heic",
      "heix",
      "hevc",
      "hevx",
      "heim",
      "heis",
      "hevm",
      "hevs",
    ]) {
      expect(detectImageMediaType(isoImage(brand))).toBe("image/heic")
    }
    expect(detectImageMediaType(isoImage("miaf", "heix"))).toBe("image/heic")
  })

  test("detects generic HEIF brands", () => {
    expect(detectImageMediaType(isoImage("mif1"))).toBe("image/heif")
    expect(detectImageMediaType(isoImage("msf1"))).toBe("image/heif")
  })

  test("rejects unrecognized, truncated, and malformed ISO media bytes", () => {
    expect(
      detectImageMediaType(new Uint8Array(ascii("not an image")))
    ).toBeNull()
    expect(detectImageMediaType(new Uint8Array([0xff, 0xd8]))).toBeNull()
    expect(detectImageMediaType(isoImage("mp42"))).toBeNull()

    const malformed = isoImage("avif")
    malformed[3] = malformed.length + 4
    expect(detectImageMediaType(malformed)).toBeNull()
  })

  test("classifies claimed images without requiring browser MIME accuracy", () => {
    expect(isClaimedImageUpload("image/jpeg", "upload.bin")).toBe(true)
    expect(
      isClaimedImageUpload("application/octet-stream", "camera.HEIF")
    ).toBe(true)
    expect(isClaimedImageUpload("application/octet-stream", "notes.txt")).toBe(
      false
    )
  })

  test("canonical detection ignores mismatched browser MIME and extension", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(isClaimedImageUpload("image/jpeg", "camera.jpg")).toBe(true)
    expect(detectImageMediaType(png)).toBe("image/png")
  })
})
