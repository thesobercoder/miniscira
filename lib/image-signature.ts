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

const AVIF_BRANDS = new Set(["avif", "avis"])
const HEIC_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "hevm",
  "hevs",
])
const HEIF_BRANDS = new Set(["mif1", "msf1"])

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

function detectIsoImage(bytes: Uint8Array): SupportedImageMediaType | null {
  if (bytes.length < 16 || ascii(bytes, 4) !== "ftyp") return null

  const declaredSize = uint32(bytes, 0)
  const boxSize = declaredSize === 0 ? bytes.length : declaredSize
  if (boxSize < 16 || boxSize > bytes.length) return null

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
  if ([...brands].some((brand) => HEIF_BRANDS.has(brand))) return "image/heif"
  return null
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

  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg"
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png"
  }
  if (
    startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return "image/gif"
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0) === "RIFF" &&
    ascii(bytes, 8) === "WEBP"
  ) {
    return "image/webp"
  }
  if (startsWith(bytes, [0x42, 0x4d])) return "image/bmp"
  if (
    startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) ||
    startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a]) ||
    startsWith(bytes, [0x49, 0x49, 0x2b, 0x00]) ||
    startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2b])
  ) {
    return "image/tiff"
  }
  return detectIsoImage(bytes)
}
