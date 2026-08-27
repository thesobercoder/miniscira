const MAX_DIMENSION = 1600
const SMALL_JPEG_BYTES = 300_000
const JPEG_QUALITY = 0.85
const KNOWN_IMAGE_EXTENSION = /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|tiff?|webp)$/i

export function renameToJpg(filename: string): string {
  return KNOWN_IMAGE_EXTENSION.test(filename)
    ? filename.replace(KNOWN_IMAGE_EXTENSION, ".jpg")
    : `${filename}.jpg`
}

function targetDimensions(width: number, height: number) {
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height))
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  }
}

export async function normalizeImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file
  const canvasAvailable =
    typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined"
  if (
    typeof window === "undefined" ||
    typeof createImageBitmap === "undefined" ||
    !canvasAvailable
  )
    return file

  try {
    const bitmap = await createImageBitmap(file)
    try {
      if (
        bitmap.width <= MAX_DIMENSION &&
        bitmap.height <= MAX_DIMENSION &&
        file.size <= SMALL_JPEG_BYTES &&
        file.type === "image/jpeg"
      )
        return file

      const dimensions = targetDimensions(bitmap.width, bitmap.height)
      let blob: Blob | null

      if (typeof OffscreenCanvas !== "undefined") {
        const canvas = new OffscreenCanvas(dimensions.width, dimensions.height)
        const context = canvas.getContext("2d")
        if (!context) return file
        context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height)
        blob = await canvas.convertToBlob({
          type: "image/jpeg",
          quality: JPEG_QUALITY,
        })
      } else {
        const canvas = document.createElement("canvas")
        canvas.width = dimensions.width
        canvas.height = dimensions.height
        const context = canvas.getContext("2d")
        if (!context) return file
        context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height)
        blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
        )
      }

      if (!blob) return file
      return new File([blob], renameToJpg(file.name), {
        type: "image/jpeg",
        lastModified: Date.now(),
      })
    } finally {
      bitmap.close()
    }
  } catch {
    return file
  }
}
