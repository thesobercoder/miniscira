import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import type { Metadata } from "next"
import { Be_Vietnam_Pro, Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { appBaseUrl } from "@/lib/base-url"
import { cn } from "@/lib/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

// Wordmark font (the "miniscira" mark on the empty state).
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-be-vietnam-pro",
})

// One description for the page, the preview card and the tweet card. Pages must
// not declare their own `openGraph` to vary it: that replaces this object and
// takes `app/opengraph-image.png` with it.
const DESCRIPTION =
  "Ask a question. It reads the web and your own documents, then answers with the sources attached. Self-hosted, on your own AI Gateway key."

export const metadata: Metadata = {
  // Without this, Next emits a relative og:image, which no unfurler resolves.
  // `appBaseUrl()` is the same origin the lookout emails link to, so a preview
  // card and an email link can never disagree about where this deployment is.
  metadataBase: new URL(appBaseUrl()),
  title: "MiniScira",
  description: DESCRIPTION,
  // `app/opengraph-image.png` is picked up by file convention and fills in
  // og:image; Twitter falls back to it when there is no twitter-image.
  openGraph: {
    type: "website",
    siteName: "MiniScira",
    title: "MiniScira",
    description: DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "MiniScira",
    description: DESCRIPTION,
  },
}

// Set by the platform on every Vercel build and runtime; unset everywhere else.
// The layout is a server component, so this resolves at render and neither
// component mounts off-platform — verified: no injected script, no `window.va`,
// no network request. Their chunk is still emitted either way, since the import
// is unconditional; it just never executes.
const onVercel = Boolean(process.env.VERCEL)

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable,
        beVietnamPro.variable
      )}
    >
      <body>
        <ThemeProvider>
          {/* Base UI names this `delay` (Radix called it `delayDuration`). */}
          <TooltipProvider delay={300}>{children}</TooltipProvider>
          <Toaster />
        </ThemeProvider>
        {/* Both fetch their script from `/_vercel/…`, which only the Vercel
            platform serves — off-platform that is a guaranteed 404 in every
            visitor's network tab, collecting nothing. A self-host is a
            first-class target here, so they mount only where they work. */}
        {onVercel && (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        )}
      </body>
    </html>
  )
}
