import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { SignInScreen } from "@/components/sign-in-screen"
import { auth } from "@/lib/auth"
import { signedInRedirect } from "@/lib/urls"

/**
 * Server half of the sign-in route.
 *
 * Exists only to read which OAuth providers have credentials and hand that down
 * — the screen itself is a client component and must never see the secrets,
 * just the fact that they are present. `lib/auth.ts` registers a provider under
 * exactly these conditions, so the two stay in step.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string | string[] }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session) {
    const requested = (await searchParams).redirect
    redirect(
      signedInRedirect(Array.isArray(requested) ? requested[0] : requested)
    )
  }

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
