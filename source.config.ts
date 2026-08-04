import { defineConfig, defineDocs } from "fumadocs-mdx/config"

// Kept as a config file rather than the `fumadocs-mdx/macro` form on purpose:
// the macro relies on a content-conditioned Turbopack rule, and this file is
// also what the Docker build has to copy into the image before `next build`.
export const docs = defineDocs({
  dir: "content/docs",
})

export default defineConfig()
