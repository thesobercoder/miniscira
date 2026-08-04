import { SignInScreen } from "@/components/sign-in-screen"

/**
 * Server half of the sign-in route.
 *
 * Exists only to read which OAuth providers have credentials and hand that down
 * — the screen itself is a client component and must never see the secrets,
 * just the fact that they are present. `lib/auth.ts` registers a provider under
 * exactly these conditions, so the two stay in step.
 */
export default function SignInPage() {
  return (
    <SignInScreen
      providers={{
        vercel: Boolean(
          process.env.VERCEL_CLIENT_ID && process.env.VERCEL_CLIENT_SECRET
        ),
        google: Boolean(
          process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ),
        github: Boolean(
          process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
        ),
      }}
    />
  )
}
