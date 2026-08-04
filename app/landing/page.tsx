import { RiBookOpenLine, RiGithubFill } from "@remixicon/react"
import type { Metadata } from "next"
import Link from "next/link"

import { LandingTimeline } from "@/components/landing-timeline"
import { Button } from "@/components/ui/button"

// Only the page title is overridden here. Declaring an `openGraph` block would
// replace the root layout's wholesale — including the images that
// `app/opengraph-image.png` contributes by file convention — and silently strip
// the preview image from the one page anybody actually shares. The share copy
// lives in the root layout instead, so there is a single description.
export const metadata: Metadata = {
  title: "MiniScira — an AI research assistant you host yourself",
}

/**
 * The public face of miniscira.com.
 *
 * Reached at `/` only when `DEMO_MODE=true`, where `proxy.ts` rewrites here. A
 * self-hosted deployment leaves the flag off and its `/` is the chat; `/landing`
 * itself stays addressable to a signed-in visitor either way, since the proxy
 * special-cases it only inside the demo-mode branch.
 *
 * Static and dependency-free by design: no session, no database, no gateway
 * call. It has to render on a deployment holding no credentials at all.
 *
 * Be Vietnam Pro is promoted from wordmark-only to the display face here. It is
 * the one typeface in the app with any character, and letting it carry the
 * headline is what stops the page reading as Inter-on-black like everything
 * else. Body stays Inter; machine output stays mono.
 */
export default function LandingPage() {
  return (
    <main className="min-h-dvh">
      <div className="mx-auto max-w-5xl px-6 py-16 md:py-24">
        <span className="font-[family-name:var(--font-be-vietnam-pro)] font-semibold text-lg tracking-tight">
          miniscira
        </span>

        {/* Asymmetric: copy left, the product's own view right. A single
            centred column left the headline ragged against half a screen of
            nothing. */}
        <div className="mt-14 grid items-start gap-12 md:mt-20 md:grid-cols-[minmax(0,1fr)_22rem] md:gap-14">
          <div>
            {/* No `text-balance`: it re-wraps around the explicit break and
                turned two deliberate lines into three ragged ones. The break is
                the design; balancing is for text that has none. */}
            <h1 className="font-[family-name:var(--font-be-vietnam-pro)] font-semibold text-[2.5rem] leading-[1.05] tracking-tight md:text-6xl">
              Research that
              <br />
              shows its working.
            </h1>
            <p className="mt-6 max-w-md text-pretty text-lg text-muted-foreground leading-relaxed">
              Ask a question. It goes off and reads the sources, then answers
              with the receipts attached. You watch it work the whole way.
            </p>

            <div className="mt-8 flex flex-wrap gap-2">
              <Button
                className="h-10 shadow-xs"
                nativeButton={false}
                render={<Link href="/docs/self-host" />}
              >
                Self-host it
              </Button>
              <Button
                variant="outline"
                className="h-10 gap-2 shadow-xs"
                nativeButton={false}
                render={<Link href="/docs" />}
              >
                <RiBookOpenLine className="size-4" />
                Docs
              </Button>
              <Button
                variant="outline"
                className="h-10 gap-2 shadow-xs"
                nativeButton={false}
                render={
                  <a
                    href="https://github.com/zaidmukaddam/miniscira"
                    target="_blank"
                    rel="noreferrer"
                  />
                }
              >
                <RiGithubFill className="size-4" />
                Source
              </Button>
            </div>
          </div>

          <LandingTimeline />
        </div>

        {/* Three claims, no numbering: they are not a sequence, unlike the
            timeline above. Hairline rules between them and nothing else — the
            earlier version boxed these in a `gap-px` grid that read as a table
            with bleeding corners. */}
        <div className="mt-24 grid gap-x-10 gap-y-8 border-t pt-10 sm:grid-cols-3">
          <Claim title="Your key, your bill">
            Runs on your own Vercel AI Gateway key, so the usage lands on your
            Vercel bill and nobody sits in between taking a cut.
          </Claim>
          <Claim title="Reads your documents">
            Upload PDFs and it searches those alongside the web. Nothing to
            index or keep in sync; the ranking happens when you ask.
          </Claim>
          <Claim title="Yours to run">
            One Next.js app, one agent. Vercel, Docker, or a plain VPS — the
            docs cover all three, including the parts that bite.
          </Claim>
        </div>

        <footer className="mt-20 flex flex-wrap items-baseline justify-between gap-3 border-t pt-6 text-muted-foreground text-sm">
          <p>
            This deployment is a showcase with no chat of its own. Run your own
            copy and it comes up as the full app.
          </p>
          <p className="font-mono text-xs">
            <a
              href="https://github.com/vercel/eve"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              eve
            </a>
            {" · "}
            <a
              href="https://vercel.com/ai-gateway"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              ai gateway
            </a>
          </p>
        </footer>
      </div>
    </main>
  )
}

function Claim({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="font-medium text-foreground text-sm">{title}</h2>
      <p className="mt-1.5 text-pretty text-muted-foreground text-sm leading-relaxed">
        {children}
      </p>
    </section>
  )
}
