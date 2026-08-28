import { afterEach, describe, expect, mock, test } from "bun:test"

import { normalizeImage, renameToJpg } from "@/lib/image-normalize"

const browserGlobals = [
  "window",
  "document",
  "createImageBitmap",
  "OffscreenCanvas",
] as const

const originalDescriptors = new Map(
  browserGlobals.map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name),
  ])
)

function setGlobal(name: (typeof browserGlobals)[number], value: unknown) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value,
    writable: true,
  })
}

function removeGlobal(name: (typeof browserGlobals)[number]) {
  Reflect.deleteProperty(globalThis, name)
}

function restoreBrowserGlobals() {
  for (const name of browserGlobals) {
    const descriptor = originalDescriptors.get(name)
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else removeGlobal(name)
  }
}

function installBrowser(bitmap: {
  width: number
  height: number
  close: ReturnType<typeof mock>
}) {
  setGlobal("window", {})
  const createBitmap = mock(async () => bitmap)
  setGlobal("createImageBitmap", createBitmap)
  return createBitmap
}

function imageFile({
  bytes = 400_000,
  name = "photo.png",
  type = "image/png",
}: {
  bytes?: number
  name?: string
  type?: string
} = {}) {
  return new File([new Uint8Array(bytes)], name, { type })
}

afterEach(() => {
  restoreBrowserGlobals()
  mock.restore()
})

describe("normalizeImage", () => {
  test("returns non-images unchanged", async () => {
    const file = new File(["hello"], "notes.txt", { type: "text/plain" })

    expect(await normalizeImage(file)).toBe(file)
  })

  test("returns images unchanged during server rendering", async () => {
    const file = imageFile()
    removeGlobal("window")

    expect(await normalizeImage(file)).toBe(file)
  })

  test("normalizes a landscape image through OffscreenCanvas", async () => {
    const close = mock(() => undefined)
    const bitmap = { width: 3200, height: 1800, close }
    const createBitmap = installBrowser(bitmap)
    const drawImage = mock(() => undefined)
    const outputBlob = new Blob(["normalized"])
    const convertToBlob = mock(
      async (_options: ImageEncodeOptions) => outputBlob
    )
    const canvases: Array<{ width: number; height: number }> = []

    class FakeOffscreenCanvas {
      constructor(
        public width: number,
        public height: number
      ) {
        canvases.push(this)
      }

      getContext() {
        return { drawImage }
      }

      convertToBlob(options: ImageEncodeOptions) {
        return convertToBlob(options)
      }
    }

    setGlobal("OffscreenCanvas", FakeOffscreenCanvas)
    removeGlobal("document")
    const file = imageFile({ name: "wide.PNG" })

    const normalized = await normalizeImage(file)

    expect(createBitmap).toHaveBeenCalledWith(file)
    expect(canvases).toEqual([{ width: 1600, height: 900 }])
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1600, 900)
    expect(convertToBlob).toHaveBeenCalledWith({
      type: "image/jpeg",
      quality: 0.85,
    })
    expect(normalized).not.toBe(file)
    expect(normalized.name).toBe("wide.jpg")
    expect(normalized.type).toBe("image/jpeg")
    expect(await normalized.text()).toBe("normalized")
    expect(close).toHaveBeenCalledTimes(1)
  })

  test("normalizes a portrait image through a DOM canvas", async () => {
    const close = mock(() => undefined)
    const bitmap = { width: 1800, height: 3200, close }
    installBrowser(bitmap)
    removeGlobal("OffscreenCanvas")
    const drawImage = mock(() => undefined)
    const outputBlob = new Blob(["portrait"])
    const toBlob = mock(
      (callback: BlobCallback, _type?: string, _quality?: number) =>
        callback(outputBlob)
    )
    const canvas = {
      width: 0,
      height: 0,
      getContext: mock(() => ({ drawImage })),
      toBlob,
    }
    const createElement = mock((tagName: string) => {
      expect(tagName).toBe("canvas")
      return canvas
    })
    setGlobal("document", { createElement })
    const file = imageFile({ name: "portrait.webp" })

    const normalized = await normalizeImage(file)

    expect(canvas.width).toBe(900)
    expect(canvas.height).toBe(1600)
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 900, 1600)
    expect(toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/jpeg",
      0.85
    )
    expect(normalized.name).toBe("portrait.jpg")
    expect(normalized.type).toBe("image/jpeg")
    expect(await normalized.text()).toBe("portrait")
    expect(close).toHaveBeenCalledTimes(1)
  })

  test("keeps a small JPEG unchanged and closes its decoded bitmap", async () => {
    const close = mock(() => undefined)
    installBrowser({ width: 1200, height: 800, close })
    setGlobal("OffscreenCanvas", class {})
    const file = imageFile({
      bytes: 300_000,
      name: "small.jpeg",
      type: "image/jpeg",
    })

    expect(await normalizeImage(file)).toBe(file)
    expect(close).toHaveBeenCalledTimes(1)
  })

  test("falls back when createImageBitmap cannot decode the file", async () => {
    setGlobal("window", {})
    setGlobal("OffscreenCanvas", class {})
    const createBitmap = mock(async () => {
      throw new Error("decode failed")
    })
    setGlobal("createImageBitmap", createBitmap)
    const file = imageFile()

    expect(await normalizeImage(file)).toBe(file)
    expect(createBitmap).toHaveBeenCalledWith(file)
  })

  test("falls back and closes the bitmap when OffscreenCanvas has no context", async () => {
    const close = mock(() => undefined)
    installBrowser({ width: 2000, height: 1000, close })
    setGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return null
        }
      }
    )
    const file = imageFile()

    expect(await normalizeImage(file)).toBe(file)
    expect(close).toHaveBeenCalledTimes(1)
  })

  test("falls back and closes the bitmap when DOM canvas has no context", async () => {
    const close = mock(() => undefined)
    installBrowser({ width: 1000, height: 2000, close })
    removeGlobal("OffscreenCanvas")
    setGlobal("document", {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => null,
      }),
    })
    const file = imageFile()

    expect(await normalizeImage(file)).toBe(file)
    expect(close).toHaveBeenCalledTimes(1)
  })

  test("falls back and closes the bitmap when DOM encoding returns null", async () => {
    const close = mock(() => undefined)
    installBrowser({ width: 2000, height: 1000, close })
    removeGlobal("OffscreenCanvas")
    setGlobal("document", {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: () => undefined }),
        toBlob: (callback: BlobCallback) => callback(null),
      }),
    })
    const file = imageFile()

    expect(await normalizeImage(file)).toBe(file)
    expect(close).toHaveBeenCalledTimes(1)
  })

  test("falls back and closes the bitmap when OffscreenCanvas encoding throws", async () => {
    const close = mock(() => undefined)
    installBrowser({ width: 2000, height: 1000, close })
    setGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return { drawImage: () => undefined }
        }

        async convertToBlob(): Promise<Blob> {
          throw new Error("encode failed")
        }
      }
    )
    const file = imageFile()

    expect(await normalizeImage(file)).toBe(file)
    expect(close).toHaveBeenCalledTimes(1)
  })

  test("falls back and closes the bitmap when drawing fails", async () => {
    const close = mock(() => undefined)
    installBrowser({ width: 2000, height: 1000, close })
    setGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return {
            drawImage: () => {
              throw new Error("draw failed")
            },
          }
        }
      }
    )
    const file = imageFile()

    expect(await normalizeImage(file)).toBe(file)
    expect(close).toHaveBeenCalledTimes(1)
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
