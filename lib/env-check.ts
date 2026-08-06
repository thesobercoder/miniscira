/**
 * Startup-time environment validation for self-hosted deployments.
 *
 * Called from instrumentation.ts when the Next server boots. The goal: fail
 * fast with an actionable message when a REQUIRED variable is missing, instead
 * of surfacing a confusing failure on the first model call. (The container
 * entrypoint, scripts/entrypoint.mjs, independently gates DATABASE_URL and
 * runs a coarse AI_MODELS_JSON pre-flight so a grossly malformed value takes
 * the container down before eve/next start — Next 16 logs a failed
 * instrumentation hook but keeps serving.)
 *
 * These four are the runtime-required set (the strict subset every deployment
 * needs regardless of BYOK or origin configuration). The full REQUIRED /
 * OPTIONAL matrix lives in .env.example; AI_GATEWAY_API_KEY and APP_URL are
 * legitimately optional there — gatewayCredentialFor() accepts a user-stored
 * key, and lib/base-url.ts falls back to BETTER_AUTH_URL.
 */
import { z } from "zod"

import { aiModelsJsonSchema } from "./model-metadata"

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

  // AI_MODELS_JSON — metadata-only model config (labels/order/visibility/
  // capability hints; see lib/model-metadata.ts). The live gateway catalog
  // stays authoritative for availability. Schema-validated at boot so a
  // malformed value fails here with an actionable message rather than
  // surprising the first user of the picker.
  const raw = process.env.AI_MODELS_JSON
  if (raw?.trim()) {
    try {
      aiModelsJsonSchema.parse(JSON.parse(raw))
    } catch (err) {
      const detail =
        err instanceof z.ZodError
          ? z.prettifyError(err)
          : (err as Error).message
      throw new Error(`AI_MODELS_JSON failed validation: ${detail}`)
    }
  }

  return missing
}
