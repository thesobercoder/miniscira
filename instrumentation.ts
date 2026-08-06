/**
 * Next.js instrumentation hook — runs once when the server boots.
 *
 * Enforces the deployment's fail-fast env contract (lib/env-check.ts): a
 * missing REQUIRED variable stops the container with a clear error instead of
 * surfacing confusing failures on the first model call.
 *
 * Skipped during `next build` (NEXT_PHASE=phase-production-build) — the
 * Dockerfile build stage intentionally runs without runtime env vars.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  if (process.env.NODE_ENV === "test") return
  if (process.env.NEXT_PHASE === "phase-production-build") return

  const { assertRequiredEnv } = await import("./lib/env-check")
  assertRequiredEnv()
}
