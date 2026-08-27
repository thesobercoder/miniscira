import { describe, expect, test } from "bun:test"

import { normalizeImage, renameToJpg } from "@/lib/image-normalize"

describe("normalizeImage", () => {
  test("returns non-images unchanged", async () => {
    const file = new File(["hello"], "notes.txt", { type: "text/plain" })

    expect(await normalizeImage(file)).toBe(file)
  })

  test("returns images unchanged during server rendering", async () => {
    const file = new File(["jpeg"], "photo.jpg", { type: "image/jpeg" })
    const originalWindow = globalThis.window

    try {
      delete (globalThis as { window?: Window }).window
      expect(await normalizeImage(file)).toBe(file)
    } finally {
      if (originalWindow === undefined)
        delete (globalThis as { window?: Window }).window
      else globalThis.window = originalWindow
    }
  })
})

describe("renameToJpg", () => {
  test("replaces known image extensions", () => {
    expect(renameToJpg("camera.HEIC")).toBe("camera.jpg")
    expect(renameToJpg("scan.jpeg")).toBe("scan.jpg")
  })

  test("appends jpg when the name has no known image extension", () => {
    expect(renameToJpg("camera-upload")).toBe("camera-upload.jpg")
    expect(renameToJpg("camera.bin")).toBe("camera.bin.jpg")
  })
})
