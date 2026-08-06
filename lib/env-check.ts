/**
 * Startup-time environment validation for self-hosted deployments.
 *
 * Called from instrumentation.ts when the Next server boots (and, in Phase 2,
 * from the container entrypoint). The goal: fail fast with an actionable
 * message when a REQUIRED variable is missing, instead of surfacing a
 * confusing failure on the first model call.
 *
 * These four are the runtime-required set (the strict subset every deployment
 * needs regardless of BYOK or origin configuration). The full REQUIRED /
 * OPTIONAL matrix lives in .env.example; AI_GATEWAY_API_KEY and APP_URL are
 * legitimately optional there — gatewayCredentialFor() accepts a user-stored
 * key, and lib/base-url.ts falls back to BETTER_AUTH_URL.
 */
export function assertRequiredEnv(): string[] {
  const required = [
    "DATABASE_URL",
    "AI_GATEWAY_BASE_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
  ] as const

  const missing = required.filter((name) => !process.env[name])
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        "See .env.example for the full REQUIRED/OPTIONAL matrix."
    )
  }

  // AI_MODELS_JSON is reserved for the Phase-3 model-config work; it is not
  // consumed yet, but a malformed value should fail at boot rather than
  // surprising the first user of the picker. Must parse as a JSON object
  // keyed by model id.
  const raw = process.env.AI_MODELS_JSON
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("must be a JSON object keyed by model id")
      }
    } catch (err) {
      throw new Error(
        `AI_MODELS_JSON is not valid JSON: ${(err as Error).message}`
      )
    }
  }

  return missing
}
