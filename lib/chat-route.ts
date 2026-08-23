export function chatPath(id: string): string {
  return `/chat/${encodeURIComponent(id)}`
}
