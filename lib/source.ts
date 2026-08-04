import { loader } from "fumadocs-core/source"

import { docs } from "@/.source/server"

// `.source` is generated from `source.config.ts` + `content/docs` by the
// fumadocs-mdx plugin in `next.config.ts`, and by the `postinstall` script so
// `tsc --noEmit` has something to resolve. Gitignored — treat it like `.next`.
export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
})
