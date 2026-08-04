import { cn } from "@/lib/utils"

/**
 * The Vercel triangle.
 *
 * Inline rather than an `<img>` from a brand CDN, unlike the Google and GitHub
 * marks beside it on the sign-in page: this one sits on a filled primary button
 * and has to take the button's foreground colour in both themes, which a remote
 * SVG cannot do.
 */
export function VercelMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 76 65"
      aria-hidden="true"
      className={cn("size-4", className)}
    >
      <title>Vercel</title>
      <path d="M37.59.25l36.95 64H.64l36.95-64z" fill="currentColor" />
    </svg>
  )
}
