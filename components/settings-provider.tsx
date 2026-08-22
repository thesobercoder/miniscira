"use client"

import { createContext, useCallback, useContext, useRef, useState } from "react"
import { toast } from "sonner"

import { normalizeTone, type UserSettings } from "@/lib/tones"

type SettingsPatch = Partial<{
  nickname: string | null
  instructions: string | null
  tone: string
}>

type SettingsContextValue = {
  settings: UserSettings
  saving: boolean
  save: (patch: SettingsPatch) => Promise<boolean>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

// Holds the signed-in user's personalization, seeded from the server so it's
// available on first paint. The chat reads it to shape each turn; the settings
// page reads and writes it. Optimistic on save, reconciled with the server.
export function SettingsProvider({
  initial,
  children,
}: {
  initial: UserSettings
  children: React.ReactNode
}) {
  const [settings, setSettings] = useState<UserSettings>(initial)
  const [saving, setSaving] = useState(false)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const saveVersionRef = useRef(0)

  const save = useCallback(async (patch: SettingsPatch) => {
    const version = saveVersionRef.current + 1
    saveVersionRef.current = version
    const previous = settingsRef.current
    setSaving(true)
    setSettings((prev) => ({
      nickname:
        patch.nickname !== undefined
          ? patch.nickname?.trim() || null
          : prev.nickname,
      instructions:
        patch.instructions !== undefined
          ? patch.instructions?.trim() || null
          : prev.instructions,
      tone: patch.tone !== undefined ? normalizeTone(patch.tone) : prev.tone,
    }))
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      })
      const json = (await res.json().catch(() => ({}))) as {
        settings?: UserSettings
        error?: string
      }
      if (!res.ok || !json.settings) {
        if (version === saveVersionRef.current) setSettings(previous)
        toast.error(json.error ?? "Couldn't save your settings.")
        return false
      }
      if (version === saveVersionRef.current) setSettings(json.settings)
      return true
    } catch {
      if (version === saveVersionRef.current) setSettings(previous)
      toast.error("Couldn't save your settings.")
      return false
    } finally {
      if (version === saveVersionRef.current) setSaving(false)
    }
  }, [])

  return (
    <SettingsContext.Provider value={{ settings, saving, save }}>
      {children}
    </SettingsContext.Provider>
  )
}

/** Returns the settings context, or null when rendered outside the provider. */
export function useSettings(): SettingsContextValue | null {
  return useContext(SettingsContext)
}
