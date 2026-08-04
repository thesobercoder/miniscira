"use client"

import { RiCheckLine, RiLoader4Line } from "@remixicon/react"
import { useState } from "react"
import { useSettings } from "@/components/settings-provider"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TONE_META, TONES } from "@/lib/tones"
import { cn } from "@/lib/utils"

/**
 * Nothing at rest — a "Saved" badge on first paint claims a write that never
 * happened. It only appears once this session has actually persisted something,
 * and the region is in the tree from the start so the change is announced.
 */
function SaveState({ saving, saved }: { saving: boolean; saved: boolean }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className="flex items-center gap-1 text-muted-foreground text-xs empty:hidden"
    >
      {saving ? (
        <>
          <RiLoader4Line className="size-3.5 animate-spin" /> Saving…
        </>
      ) : saved ? (
        <>
          <RiCheckLine className="size-3.5 text-primary-strong" /> Saved
        </>
      ) : null}
    </span>
  )
}

export function SettingsPersonalization() {
  const ctx = useSettings()
  const [nickname, setNickname] = useState(ctx?.settings.nickname ?? "")
  const [instructions, setInstructions] = useState(
    ctx?.settings.instructions ?? ""
  )
  // Has this session persisted anything yet? Drives the "Saved" affordance.
  const [everSaved, setEverSaved] = useState(false)

  if (!ctx) return null
  const { settings, saving, save } = ctx

  const persist = (patch: Parameters<typeof save>[0]) => {
    setEverSaved(true)
    void save(patch)
  }

  // Persist a field on blur only when it actually changed.
  const commitNickname = () => {
    const next = nickname.trim()
    if (next !== (settings.nickname ?? "")) persist({ nickname: next })
  }
  const commitInstructions = () => {
    const next = instructions.trim()
    if (next !== (settings.instructions ?? "")) persist({ instructions: next })
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-foreground text-sm">
            Personalization
          </h2>
          <p className="text-muted-foreground text-sm">
            These apply to every chat and shape how the assistant answers you.
          </p>
        </div>
        <SaveState saving={saving} saved={everSaved} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="nickname">What should we call you?</Label>
        <Input
          id="nickname"
          value={nickname}
          maxLength={80}
          placeholder="e.g. Zaid"
          onChange={(e) => setNickname(e.target.value)}
          onBlur={commitNickname}
          className="max-w-sm"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="instructions">Custom instructions</Label>
        <p className="-mt-1 text-muted-foreground text-xs">
          Anything the assistant should always keep in mind — your background,
          how you like answers, topics to focus on or avoid.
        </p>
        <Textarea
          id="instructions"
          value={instructions}
          maxLength={4000}
          rows={5}
          placeholder="e.g. I'm a software engineer. Prefer code examples in TypeScript and skip the basics."
          onChange={(e) => setInstructions(e.target.value)}
          onBlur={commitInstructions}
          className="resize-y"
        />
        <span className="self-end text-[11px] text-muted-foreground tabular-nums">
          {instructions.length}/4000
        </span>
      </div>

      <div className="grid gap-2.5">
        <Label>Response tone</Label>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TONES.map((tone) => {
            const meta = TONE_META[tone]
            const active = settings.tone === tone
            return (
              <button
                key={tone}
                type="button"
                onClick={() => !active && persist({ tone })}
                aria-pressed={active}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  active
                    ? "border-primary/50 bg-accent"
                    : "bg-card hover:border-border hover:bg-accent/50"
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      active ? "bg-primary" : "bg-muted-foreground/30"
                    )}
                  />
                  <span className="font-medium text-sm">{meta.label}</span>
                </div>
                <p className="mt-1 text-pretty text-muted-foreground text-xs">
                  {meta.hint}
                </p>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
