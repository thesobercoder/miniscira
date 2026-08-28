export type SupportedImageMediaType =
  | "image/avif"
  | "image/bmp"
  | "image/gif"
  | "image/heic"
  | "image/heif"
  | "image/jpeg"
  | "image/png"
  | "image/tiff"
  | "image/webp"

export const SUPPORTED_IMAGE_EXTENSIONS = [
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "jpeg",
  "jpg",
  "png",
  "tif",
  "tiff",
  "webp",
] as const

const IMAGE_EXTENSIONS = new Set<string>(SUPPORTED_IMAGE_EXTENSIONS)
const AVIF_BRANDS = new Set(["avif"])
const HEIC_BRANDS = new Set(["heic", "heix"])

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return (
    bytes.length >= signature.length &&
    signature.every((byte, index) => bytes[index] === byte)
  )
}

function ascii(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0
  )
}

function uint32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) * 0x1000000 +
    (bytes[offset + 1] ?? 0) * 0x10000 +
    (bytes[offset + 2] ?? 0) * 0x100 +
    (bytes[offset + 3] ?? 0)
  )
}

function littleEndianUint32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) +
    (bytes[offset + 1] ?? 0) * 0x100 +
    (bytes[offset + 2] ?? 0) * 0x10000 +
    (bytes[offset + 3] ?? 0) * 0x1000000
  )
}

function detectIsoImage(bytes: Uint8Array): SupportedImageMediaType | null {
  if (bytes.length < 16 || ascii(bytes, 4) !== "ftyp") return null

  const declaredSize = uint32(bytes, 0)
  const boxSize = declaredSize === 0 ? bytes.length : declaredSize
  if (boxSize < 16 || boxSize > bytes.length || (boxSize - 16) % 4 !== 0) {
    return null
  }

  const brands = new Set<string>([ascii(bytes, 8)])
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    brands.add(ascii(bytes, offset))
  }

  if ([...brands].some((brand) => AVIF_BRANDS.has(brand))) {
    return "image/avif"
  }
  if ([...brands].some((brand) => HEIC_BRANDS.has(brand))) {
    return "image/heic"
  }
  return null
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 33 &&
    startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) &&
    uint32(bytes, 8) === 13 &&
    ascii(bytes, 12) === "IHDR" &&
    uint32(bytes, 16) > 0 &&
    uint32(bytes, 20) > 0
  )
}

function isWebp(bytes: Uint8Array): boolean {
  if (
    bytes.length < 20 ||
    ascii(bytes, 0) !== "RIFF" ||
    ascii(bytes, 8) !== "WEBP" ||
    !["VP8 ", "VP8L", "VP8X"].includes(ascii(bytes, 12))
  ) {
    return false
  }
  return littleEndianUint32(bytes, 4) + 8 <= bytes.length
}

function isBmp(bytes: Uint8Array): boolean {
  if (bytes.length < 26 || !startsWith(bytes, [0x42, 0x4d])) return false
  const fileSize = littleEndianUint32(bytes, 2)
  const pixelOffset = littleEndianUint32(bytes, 10)
  const dibSize = littleEndianUint32(bytes, 14)
  return (
    fileSize >= 26 &&
    fileSize <= bytes.length &&
    pixelOffset === 14 + dibSize &&
    dibSize >= 12
  )
}

function isTiff(bytes: Uint8Array): boolean {
  if (bytes.length < 10) return false
  const littleEndian = startsWith(bytes, [0x49, 0x49, 0x2a, 0x00])
  const bigEndian = startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])
  if (!littleEndian && !bigEndian) return false
  const firstIfdOffset = littleEndian
    ? littleEndianUint32(bytes, 4)
    : uint32(bytes, 4)
  return firstIfdOffset >= 8 && firstIfdOffset + 2 <= bytes.length
}

export function isClaimedImageUpload(
  claimedMediaType: string,
  filename: string
): boolean {
  if (claimedMediaType.toLowerCase().startsWith("image/")) return true
  const extension = filename.toLowerCase().match(/\.([^.]+)$/)?.[1]
  return extension ? IMAGE_EXTENSIONS.has(extension) : false
}

export function detectImageMediaType(
  data: ArrayBuffer | Uint8Array
): SupportedImageMediaType | null {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)

  if (bytes.length >= 11 && startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg"
  }
  if (isPng(bytes)) return "image/png"
  if (
    bytes.length >= 13 &&
    (startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
      startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))
  ) {
    return "image/gif"
  }
  if (isWebp(bytes)) return "image/webp"
  if (isBmp(bytes)) return "image/bmp"
  if (isTiff(bytes)) return "image/tiff"
  return detectIsoImage(bytes)
}
