import { defineEvalConfig } from "eve/evals"

// Deterministic assertions only for now — no judge model needed. Remote
// production runs use EVE_EVAL_AUTH_TOKEN and the durable fixture principal
// prepared by scripts/prepare-thread-search-evals.py.
export default defineEvalConfig({
  maxConcurrency: 2,
})
