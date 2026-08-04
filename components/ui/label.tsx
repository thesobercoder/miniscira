"use client"

import type * as React from "react"

import { cn } from "@/lib/utils"

// Base UI has no Label primitive, so this is a native <label> — callers supply
// htmlFor (or nest the control) exactly as they did with the Radix primitive.
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: generic wrapper; the caller owns the association
    <label
      data-slot="label"
      className={cn(
        "flex select-none items-center gap-2 font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50 group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
