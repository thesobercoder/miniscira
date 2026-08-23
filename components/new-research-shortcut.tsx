"use client"

import { useRouter } from "next/navigation"
import { useMountEffect } from "@/hooks/use-mount-effect"

export const NEW_RESEARCH_SHORTCUT = "Mod+Shift+O"

type NewResearchKeyEvent = Pick<
  KeyboardEvent,
  | "altKey"
  | "ctrlKey"
  | "defaultPrevented"
  | "key"
  | "metaKey"
  | "repeat"
  | "shiftKey"
>

export function isNewResearchShortcut(event: NewResearchKeyEvent) {
  return (
    !event.defaultPrevented &&
    !event.repeat &&
    !event.altKey &&
    event.shiftKey &&
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === "o"
  )
}

export function NewResearchShortcut() {
  const router = useRouter()

  useMountEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isNewResearchShortcut(event)) return

      event.preventDefault()
      router.push("/")
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  })

  return null
}
