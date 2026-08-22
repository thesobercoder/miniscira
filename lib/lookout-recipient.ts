/** Lookout delivery is tied to the owner's Better Auth signup email. */
export function lookoutRecipient(
  email: string | null | undefined
): string | null {
  const recipient = email?.trim()
  return recipient || null
}
