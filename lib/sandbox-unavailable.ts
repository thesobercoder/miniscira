// Pure helpers for the Railway no-Docker path. Kept separate from
// agent/tools/run_code.ts so unit tests can cover the contract without
// importing the tool's db/blob side effects.
export const SANDBOX_UNAVAILABLE_MESSAGE =
  "Code execution is unavailable on this deployment (no Docker sandbox). Turn continues without code output."

const SANDBOX_UNAVAILABLE_RE =
  /docker|socket|sandbox|unavailable|econnrefused|enoent|eacces|no such file|connection refused|proxy|DOCKER_HOST/i

export function isSandboxUnavailableError(err: unknown): boolean {
  if (err === null || err === undefined) return false
  const message =
    err instanceof Error ? `${err.message} ${String(err.cause ?? "")}` : String(err)
  return SANDBOX_UNAVAILABLE_RE.test(message)
}

export function sandboxUnavailableResult(title?: string, code?: string) {
  return {
    ...(title !== undefined ? { title } : {}),
    ...(code !== undefined ? { code } : {}),
    stdout: "",
    stderr: SANDBOX_UNAVAILABLE_MESSAGE,
    exitCode: 1,
    ok: false as const,
    images: [] as { name: string; url: string }[],
    files: [] as never[],
  }
}
