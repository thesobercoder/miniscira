"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { Button } from "@/components/ui/button"
import { DotmHex3 } from "@/components/ui/dotm-hex-3"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { VercelMark } from "@/components/vercel-mark"
import { useMountEffect } from "@/hooks/use-mount-effect"
import { authClient } from "@/lib/auth-client"
import { safeRedirect } from "@/lib/urls"
import { cn } from "@/lib/utils"

const BRAND_LINES = [
  "Reading the internet so you don't have to…",
  "Cross-checking the claims…",
  "Chasing down the footnotes…",
  "Reading the fine print…",
  "Separating signal from noise…",
]

// GitHub's mark is black/white by brand, so it needs a theme swap like the
// model-picker provider icons; Google's is colorful and works on either.
export type Provider = "vercel" | "google" | "github"

/**
 * Which social logins the server actually has credentials for.
 *
 * `lib/auth.ts` registers a provider only when its client id and secret are
 * both set, so rendering a button unconditionally offers a route that answers
 * with an error. The list is computed on the server and passed down because the
 * secrets must never reach the client — only the fact that they exist.
 */
export type EnabledProviders = Record<Provider, boolean>

function SocialIcon({ provider }: { provider: Provider }) {
  if (provider === "vercel") return <VercelMark />
  if (provider === "google") {
    return (
      // biome-ignore lint/performance/noImgElement: tiny external brand svg
      <img
        src="https://svgl.app/library/google.svg"
        alt=""
        className="size-4.5"
      />
    )
  }
  return (
    <>
      {/* biome-ignore lint/performance/noImgElement: tiny external brand svg */}
      <img
        src="https://svgl.app/library/github_light.svg"
        alt=""
        className="size-4.5 dark:hidden"
      />
      {/* biome-ignore lint/performance/noImgElement: tiny external brand svg */}
      <img
        src="https://svgl.app/library/github_dark.svg"
        alt=""
        className="hidden size-4.5 dark:block"
      />
    </>
  )
}

// The living bit on the brand panel: dot-matrix loader + cycling shimmer line.
function BrandPulse() {
  const [i, setI] = useState(0)
  useMountEffect(() => {
    const id = setInterval(
      () => setI((x) => (x + 1) % BRAND_LINES.length),
      2600
    )
    return () => clearInterval(id)
  })
  return (
    <div className="flex items-center gap-3">
      <DotmHex3
        size={22}
        dotSize={3}
        className="shrink-0 text-primary-strong"
      />
      <span key={i} className="shimmer-text fade-in animate-in text-lg">
        {BRAND_LINES[i]}
      </span>
    </div>
  )
}

function SignInForm({ providers }: { providers: EnabledProviders }) {
  const router = useRouter()
  const params = useSearchParams()
  // Never trust this straight from the query string — see safeRedirect.
  const redirectTo = safeRedirect(params.get("redirect"))

  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)
  // Auth failures render inline beside the form and are announced, instead of
  // riding a toast that auto-dismisses away from the fields that need fixing.
  const [error, setError] = useState<string | null>(null)
  const errorId = "auth-error"

  const anySocial = providers.vercel || providers.google || providers.github

  async function social(provider: Provider) {
    await authClient.signIn.social({ provider, callbackURL: redirectTo })
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (mode === "sign-up") {
        const { error } = await authClient.signUp.email({
          email,
          password,
          name,
        })
        if (error) throw new Error(error.message)
      } else {
        const { error } = await authClient.signIn.email({ email, password })
        if (error) throw new Error(error.message)
      }
      router.push(redirectTo)
      router.refresh()
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Unable to sign in. Check your email and password, then try again."
      )
      // Send focus back to the first field the user has to correct.
      document.getElementById("email")?.focus()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      {/* Wordmark for small screens, where the brand panel is hidden. */}
      <span className="font-[family-name:var(--font-be-vietnam-pro)] font-semibold text-2xl tracking-tight lg:hidden">
        miniscira
      </span>

      <div>
        <h1 className="font-semibold text-2xl tracking-tight">
          {mode === "sign-in" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-pretty text-muted-foreground text-sm">
          {mode === "sign-in"
            ? "The internet isn't going to read itself."
            : "Takes a minute to set up. Saves you hours of tab-hopping."}
        </p>
      </div>

      {/* One group for "sign in with an account you already have", one for
          email — and a single divider between them. Two dividers made three
          disconnected blocks out of what is really a choice of two paths.
          Vercel leads because the gateway key is issued by Vercel, so that
          account is the one the user needs anyway. It does not supply the key:
          Sign in with Vercel is identity-only OIDC, and every user pastes a key
          regardless of how they signed in — see lib/gateway-credentials.ts for
          the measured evidence, since assuming otherwise is an easy mistake.
          Each button appears only when the server holds its credentials, so a
          half-configured deployment shows fewer options rather than options
          that fail on click. */}
      {anySocial && (
        <>
          <div className="flex flex-col gap-2">
            {providers.vercel && (
              <Button
                onClick={() => social("vercel")}
                type="button"
                className="h-10 gap-2 shadow-xs"
              >
                <SocialIcon provider="vercel" /> Continue with Vercel
              </Button>
            )}
            {(providers.google || providers.github) && (
              <div
                className={cn(
                  "grid gap-2",
                  providers.google && providers.github
                    ? "grid-cols-2"
                    : "grid-cols-1"
                )}
              >
                {providers.google && (
                  <Button
                    variant="outline"
                    onClick={() => social("google")}
                    type="button"
                    className="h-10 gap-2 shadow-xs"
                  >
                    <SocialIcon provider="google" /> Google
                  </Button>
                )}
                {providers.github && (
                  <Button
                    variant="outline"
                    onClick={() => social("github")}
                    type="button"
                    className="h-10 gap-2 shadow-xs"
                  >
                    <SocialIcon provider="github" /> GitHub
                  </Button>
                )}
              </div>
            )}
            {/* Under the whole group, not wedged between the buttons: it
                explains the consequence of the choice above rather than
                labelling Vercel. */}
            {providers.vercel && (
              <p className="mt-0.5 text-pretty text-muted-foreground text-xs">
                Research runs on your own Vercel AI Gateway, billed to your
                team.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-muted-foreground text-xs">or</span>
            <Separator className="flex-1" />
          </div>
        </>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {mode === "sign-up" && (
          <Field>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada Lovelace"
              autoComplete="name"
              required
            />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={
              mode === "sign-up" ? "new-password" : "current-password"
            }
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            required
            minLength={8}
          />
        </Field>
        {/* Rendered unconditionally so the region is in the tree before it
            fills — a live region inserted at error time announces unreliably. */}
        <p
          id={errorId}
          role="alert"
          className="min-h-0 text-pretty text-destructive text-sm empty:hidden"
        >
          {error}
        </p>
        {/* Secondary, so only one thing on the page is lime. Two primary
            buttons competing was most of why this read as disorganised — the
            eye had no single default to land on. */}
        <Button
          type="submit"
          variant="secondary"
          disabled={loading}
          className="mt-1"
        >
          {loading && <Spinner />}
          {mode === "sign-in" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <button
        type="button"
        className="self-start text-muted-foreground text-sm transition-colors hover:text-foreground"
        onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
      >
        {mode === "sign-in"
          ? "Don't have an account? Sign up"
          : "Already have an account? Sign in"}
      </button>
    </div>
  )
}

export function SignInScreen({ providers }: { providers: EnabledProviders }) {
  return (
    <main className="grid min-h-svh lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r bg-sidebar p-10 lg:flex">
        {/* Earth at night (NASA, Unsplash), pulled into the theme: grayscale
            base, a primary-hue colorize pass, then a sidebar-tinted veil that
            thickens near the top and bottom where the copy sits. */}
        {/* biome-ignore lint/performance/noImgElement: decorative bg, no next/image sizing needed */}
        <img
          src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1600&q=70&fm=jpg&fit=crop"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-45 grayscale dark:opacity-55"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-primary/40 mix-blend-color"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-sidebar/90 via-sidebar/35 to-sidebar/90"
        />

        <span className="relative font-[family-name:var(--font-be-vietnam-pro)] font-semibold text-2xl tracking-tight">
          miniscira
        </span>
        <div className="relative">
          <BrandPulse />
        </div>
        <div className="relative flex flex-col gap-2">
          <p className="max-w-sm text-pretty text-muted-foreground text-sm">
            Ask a question. It searches, reads the sources, and answers with the
            receipts attached.
          </p>
          <a
            href="https://unsplash.com/@nasa"
            target="_blank"
            rel="noreferrer"
            className="w-fit text-muted-foreground text-xs hover:text-foreground"
          >
            Photo: NASA on Unsplash
          </a>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 md:p-10">
        <Suspense fallback={<Spinner />}>
          <SignInForm providers={providers} />
        </Suspense>
      </div>
    </main>
  )
}
