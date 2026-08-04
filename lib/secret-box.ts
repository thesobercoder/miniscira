import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto"

/**
 * Authenticated encryption for user-supplied secrets at rest.
 *
 * The only thing this currently seals is a user's AI Gateway key, which is a
 * live billing credential: anyone reading the database must not be able to
 * spend someone else's money. Encrypting it means a leaked table dump is not
 * also a leaked wallet.
 *
 * AES-256-GCM rather than plain CBC/CTR because it authenticates as well as
 * encrypts — a tampered ciphertext fails to open instead of decrypting to
 * garbage that then gets sent somewhere as a bearer token.
 *
 * The key is derived from `BETTER_AUTH_SECRET` via HKDF with a distinct `info`
 * label, so this never uses the session-signing secret directly. Rotating
 * `BETTER_AUTH_SECRET` therefore invalidates stored keys — which is the correct
 * outcome, and why `open()` reports failure instead of throwing: a user whose
 * key can no longer be read should be asked for it again, not shown a crash.
 */

const KEY_INFO = "miniscira:gateway-key:v1"
const IV_BYTES = 12 // GCM standard; 96 bits is what the mode is specified for.

function derivedKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret)
    throw new Error(
      "BETTER_AUTH_SECRET is required to encrypt stored gateway keys."
    )
  // Salt is empty on purpose: the input is already a high-entropy secret, and a
  // stored random salt would have to live beside the ciphertext to be useful.
  return Buffer.from(hkdfSync("sha256", secret, "", KEY_INFO, 32))
}

/**
 * Seal a plaintext secret.
 *
 * Returns `iv.tag.ciphertext`, base64url, each part fixed-width except the
 * last, so `open` can split without a length prefix.
 */
export function seal(plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv("aes-256-gcm", derivedKey(), iv)
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    body.toString("base64url"),
  ].join(".")
}

/** Open a sealed secret, or `null` if it is malformed, tampered with, or stale. */
export function open(sealed: string | null | undefined): string | null {
  if (!sealed) return null
  const parts = sealed.split(".")
  if (parts.length !== 3) return null
  try {
    const [iv, tag, body] = parts.map((p) => Buffer.from(p, "base64url"))
    const decipher = createDecipheriv("aes-256-gcm", derivedKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(body), decipher.final()]).toString(
      "utf8"
    )
  } catch {
    // Wrong secret, truncated column, or a forged value. All mean "we do not
    // have a usable key", which the caller handles the same way.
    return null
  }
}
