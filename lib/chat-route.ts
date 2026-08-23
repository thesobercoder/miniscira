export function chatPath(id: string): string {
  return `/chat/${encodeURIComponent(id)}`
}

export function chatTurnPath(
  id: string,
  prompt: string,
  mode: "search" | "deep"
): string {
  const params = new URLSearchParams({ q: prompt })
  if (mode === "deep") params.set("mode", mode)
  return `${chatPath(id)}?${params}`
}
