import { DocsLayout } from "fumadocs-ui/layouts/docs"
import { RootProvider } from "fumadocs-ui/provider/next"
import type { ReactNode } from "react"

import { baseOptions } from "@/lib/layout.shared"
import { source } from "@/lib/source"

/**
 * Docs live outside the `(app)` route group on purpose: that group is gated by
 * better-auth, and documentation has to be readable signed out.
 *
 * `theme.enabled: false` because the root layout already mounts next-themes via
 * `ThemeProvider`. Two providers would fight over the `class` on <html>, and
 * fumadocs' theme toggle would silently stop working.
 */
export default function DocsRootLayout({ children }: { children: ReactNode }) {
  return (
    <RootProvider theme={{ enabled: false }}>
      <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
        {children}
      </DocsLayout>
    </RootProvider>
  )
}
