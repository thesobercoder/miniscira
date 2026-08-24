import { defineEvalConfig } from "eve/evals"

// Deterministic assertions only for now — no judge model needed. Run with
// `/opt/data/bin/bun x eve eval` against a dev server; these hit the real agent
// surface. Thread-search reference-policy evals also require the documented
// owned fixture threads for the eval principal.
export default defineEvalConfig({
  maxConcurrency: 2,
})
