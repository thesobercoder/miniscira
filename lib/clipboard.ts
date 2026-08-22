function legacyCopy(text: string): boolean {
  if (typeof document === "undefined" || !document.body) return false

  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.inset = "0 auto auto -9999px"
  textarea.style.opacity = "0"
  document.body.append(textarea)

  try {
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}

/**
 * Copy in secure contexts via Clipboard API, with a synchronous selection
 * fallback for plain-http LAN deployments and browsers that deny permission.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Permission denial / insecure context: try the user-gesture fallback.
  }

  return legacyCopy(text)
}
