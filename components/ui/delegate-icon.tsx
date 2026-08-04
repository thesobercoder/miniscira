import type * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A delegated subagent in the research timeline.
 *
 * Same treatment as {@link RobotIcon}: `currentColor` rather than the source
 * art's hardcoded `stroke="black"`, which would have stayed black in dark mode.
 * Stroke attributes live on the `<svg>` so the single path stays readable.
 *
 * Shaped to pair with the resting robot — same head, but on a body with arms
 * out — so "the agent" and "an agent it delegated to" read as the same family.
 */
export function DelegateIcon({
  className,
  ...props
}: React.ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      role="presentation"
      focusable="false"
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path d="M12 3.75H6.78125C5.67668 3.75 4.78125 4.64543 4.78125 5.75V11.25C4.78125 12.3546 5.67668 13.25 6.78125 13.25H17.2188C18.3233 13.25 19.2188 12.3546 19.2188 11.25V5.75C19.2188 4.64543 18.3233 3.75 17.2188 3.75H12ZM12 3.75V1.75M8.75 7.75V9.25M15.25 7.75V9.25M5.75 13.25V14.25M5.75 14.25V15C5.75 18.4518 8.54822 21.25 12 21.25C15.4518 21.25 18.25 18.4518 18.25 15V14.25M5.75 14.25L3.75 16.25M18.25 14.25V13.25M18.25 14.25L20.25 16.25" />
    </svg>
  )
}
