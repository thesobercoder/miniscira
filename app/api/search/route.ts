import { createFromSource } from "fumadocs-core/search/server"

import { source } from "@/lib/source"

// Search index for the docs. Unauthenticated by design — same reason the
// `/docs` route sits outside the `(app)` group. Server-side rather than a
// static index because every deploy target here (Vercel, Docker, VPS) runs a
// Node server anyway.
export const { GET } = createFromSource(source)
