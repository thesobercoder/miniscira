import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"

import { db, schema } from "@/lib/db"

const socialProviders: Parameters<typeof betterAuth>[0]["socialProviders"] = {}

/**
 * Vercel is the primary sign-in because the gateway key is issued by Vercel, so
 * that is the account a user needs anyway.
 *
 * It does NOT supply the credential. `@ai-sdk/gateway` describing `apiKey` as
 * "API key *or Vercel access token*" invites exactly that assumption, and it is
 * false for this kind of token — measured, it 401s at the gateway and reaches
 * `/login/oauth/userinfo` and nothing else. Every user pastes a key regardless
 * of how they signed in; `lib/gateway-credentials.ts` carries the evidence.
 *
 * No `scope` here on purpose. Vercel takes the granted scopes from the App's
 * own configuration, and a `scope` parameter can only request a *subset* of
 * those — asking for anything the App does not already have fails the
 * authorize call outright with `invalid_scope`, before the user ever sees a
 * consent screen. Enable the scopes on the App instead; `offline_access` in
 * particular, because without a refresh token the credential dies with the
 * access token and the user silently loses the ability to run turns.
 */
if (process.env.VERCEL_CLIENT_ID && process.env.VERCEL_CLIENT_SECRET) {
  socialProviders.vercel = {
    clientId: process.env.VERCEL_CLIENT_ID,
    clientSecret: process.env.VERCEL_CLIENT_SECRET,
  }
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  }
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  socialProviders.github = {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  }
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  // Self-hosted: BETTER_AUTH_URL is the canonical origin, but LAN devices may
  // legitimately reach the app by another host/IP. Without this, better-auth
  // rejects their requests with INVALID_ORIGIN. Comma-separated origins.
  trustedOrigins: (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  account: {
    accountLinking: {
      // Lets an existing account attach Vercel without a second user row, so
      // someone who first signed in with Google keeps one identity. Linking
      // grants no gateway credential — that is the key they paste in Settings,
      // stored per user id — it only merges the accounts.
      enabled: true,
      trustedProviders: ["vercel", "google", "github"],
      // `trustedProviders` alone is NOT enough. better-auth refuses the link
      // when `requireLocalEmailVerified` (default true) meets a local user
      // whose own email was never verified — see `oauth2/link-account.ts`:
      //
      //   (requireLocalEmailVerified && !dbUser.user.emailVerified) → refuse
      //
      // Email+password sign-up here creates exactly that: `emailVerified:
      // false`, because no verification mail is configured. So every such
      // account hits `account_not_linked` the moment it tries to connect
      // Vercel — which is now the only way to pay for a turn.
      //
      // Relaxed deliberately. The default guards against someone registering
      // *your* address with a password they chose and waiting for your OAuth
      // sign-in to hand them the account. That attack needs an unverified local
      // password account to exist first, so the durable fix is verification
      // mail (or dropping password sign-up); until one of those ships, keep
      // `emailAndPassword` for known users only.
      requireLocalEmailVerified: false,
    },
  },
  socialProviders,
  // nextCookies() must be the last plugin so Set-Cookie headers from server
  // actions are applied automatically.
  plugins: [nextCookies()],
})

/**
 * The session shape better-auth infers from this config.
 *
 * @public Kept exported so route handlers and server components can name the
 * session type instead of re-inferring it.
 */
export type Session = typeof auth.$Infer.Session
