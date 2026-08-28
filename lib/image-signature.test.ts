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

const PNG = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0, 0, 0, 13, ...ascii("IHDR"),
  0, 0, 0, 1, 0, 0, 0, 1,
  8, 6, 0, 0, 0,
  0, 0, 0, 0,
] as const

const SIGNATURES = [
  ["image/jpeg", [0xff, 0xd8, 0xff, 0xe0, 0, 16, ...ascii("JFIF"), 0]],
  ["image/png", PNG],
  ["image/gif", [...ascii("GIF89a"), 1, 0, 1, 0, 0, 0, 0]],
  ["image/webp", [...ascii("RIFF"), 12, 0, 0, 0, ...ascii("WEBPVP8 "), 0, 0, 0, 0]],
  [
    "image/bmp",
    [
      ...ascii("BM"), 26, 0, 0, 0, 0, 0, 0, 0, 26, 0, 0, 0,
      12, 0, 0, 0, 1, 0, 1, 0, 1, 0, 24, 0,
    ],
  ],
  ["image/tiff", [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 0, 0]],
  ["image/tiff", [0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 0]],
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
    expect(detectImageMediaType(isoImage("mif1", "avif", "miaf"))).toBe(
      "image/avif"
    )
  })

  test("detects common HEIC brands", () => {
    for (const brand of ["heic", "heix"]) {
      expect(detectImageMediaType(isoImage(brand))).toBe("image/heic")
    }
    expect(detectImageMediaType(isoImage("miaf", "heix"))).toBe("image/heic")
  })

  test("rejects generic and sequence-only HEIF brands", () => {
    for (const brand of ["mif1", "msf1", "avis", "hevc", "hevx"]) {
      expect(detectImageMediaType(isoImage(brand))).toBeNull()
    }
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

    const misaligned = new Uint8Array([...isoImage("avif"), 0])
    misaligned[3] = misaligned.length
    expect(detectImageMediaType(misaligned)).toBeNull()
  })

  test("rejects image signatures without their minimum structure", () => {
    for (const bytes of [
      [0xff, 0xd8, 0xff],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      ascii("GIF89a"),
      [...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP")],
      ascii("BM"),
      [0x49, 0x49, 0x2a, 0],
    ]) {
      expect(detectImageMediaType(new Uint8Array(bytes))).toBeNull()
    }
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
    const png = new Uint8Array(PNG)
    expect(isClaimedImageUpload("image/jpeg", "camera.jpg")).toBe(true)
    expect(detectImageMediaType(png)).toBe("image/png")
  })
})
