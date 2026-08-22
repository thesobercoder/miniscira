"use client"

import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"

import { useMountEffect } from "@/hooks/use-mount-effect"

/** Copies text and exposes short-lived success feedback without leaking timers. */
export function useCopyFeedback(errorMessage: string) {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useMountEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current)
  })

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        if (resetTimer.current) clearTimeout(resetTimer.current)
        resetTimer.current = setTimeout(() => setCopied(false), 1500)
      } catch {
        toast.error(errorMessage)
      }
    },
    [errorMessage]
  )

  return { copied, copy }
}
