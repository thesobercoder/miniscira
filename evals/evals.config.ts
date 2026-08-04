import { defineEvalConfig } from "eve/evals"

// Deterministic assertions only for now — no judge model needed. Run with
// `bunx eve eval` against a dev server; these hit the real agent surface.
export default defineEvalConfig({
  maxConcurrency: 2,
})
