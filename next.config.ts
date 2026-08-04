import { withEve } from "eve/next"
import { createMDX } from "fumadocs-mdx/next"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactCompiler: true,
  // The floating dev-tools badge sits bottom-left, on top of the sidebar footer
  // and inside every screenshot taken of a dev build.
  devIndicators: false,
  experimental: {
    // The TypeScript CLI checker and the Turbopack dev/build filesystem caches
    // all became defaults in 16.3, so only the Rust compiler stays opt-in here.
    turbopackRustReactCompiler: true,
  },
  // pdf-inspector ships a native .node addon per platform; bundling it breaks
  // the binary resolution, so it has to stay external and be required at runtime.
  serverExternalPackages: ["@opentelemetry/api", "@firecrawl/pdf-inspector"],
}

// Order matters. `createMDX()` only accepts a plain config object — it spreads
// it and reads `.turbopack` — whereas `withEve` returns the function form
// `(phase, ctx) => config`. So MDX has to be applied innermost.
const withMDX = createMDX()

// Mounts the eve agent (agent/) same-origin at /eve/v1/*. In dev the eve server
// boots beside `next dev`; on Vercel they deploy as one project.
export default withEve(withMDX(nextConfig))
