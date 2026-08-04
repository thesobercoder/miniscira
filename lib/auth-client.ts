import { createAuthClient } from "better-auth/react"

// Consumers call through `authClient` (authClient.signIn, authClient.useSession,
// …) rather than importing the methods individually, so there's no destructured
// re-export here to keep in sync.
export const authClient = createAuthClient()
