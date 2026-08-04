"use client"

import {
  RiAddLine,
  RiCheckLine,
  RiDeleteBinLine,
  RiPauseLine,
  RiPlayLine,
  RiRadarLine,
} from "@remixicon/react"
import { useRouter } from "next/navigation"
import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useMountEffect } from "@/hooks/use-mount-effect"
import { cn } from "@/lib/utils"

type Lookout = {
  id: string
  name: string
  prompt: string
  cron: string | null
  runAt: string | null
  frequency: string
  timezone: string
  status: string
  nextRunAt: string | null
  lastRunAt: string | null
}

type Frequency = "daily" | "weekly" | "once"

// Derive a UTC cron from the picked local date/time. The Date is a moment, so
// getUTC* yields the timezone-correct fields directly. (One-time lookouts send
// the runAt moment itself instead of a cron.)
function cronFrom(freq: Frequency, runAt: Date): string {
  const m = runAt.getUTCMinutes()
  const h = runAt.getUTCHours()
  if (freq === "weekly") return `${m} ${h} * * ${runAt.getUTCDay()}` // a weekday, not a date
  return `${m} ${h} * * *`
}

function describe(l: Lookout): string {
  if (l.frequency === "daily") return "Daily"
  if (l.frequency === "weekly") return "Weekly"
  if (l.runAt)
    return `Once · ${new Date(l.runAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
  return l.cron ? `Cron: ${l.cron}` : "One-time"
}

export function LookoutsView({ initial }: { initial: Lookout[] }) {
  const router = useRouter()
  const [items, setItems] = useState(initial)
  // Id of the row whose change just persisted. Drives a brief confirmation
  // pulse so an optimistic toggle visibly *lands* instead of only flipping.
  const [justSettled, setJustSettled] = useState<string | null>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setSettled = useCallback((id: string) => {
    setJustSettled(id)
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => setJustSettled(null), 1200)
  }, [])
  useMountEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current)
  })
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  // create form
  const [prompt, setPrompt] = useState("")
  const [name, setName] = useState("")
  const [freq, setFreq] = useState<Frequency>("daily")
  const [runAt, setRunAt] = useState(() => {
    const d = new Date()
    d.setHours(9, 0, 0, 0)
    return d
  })
  const create = async () => {
    if (!prompt.trim()) return
    setCreating(true)
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const payload =
      freq === "once"
        ? {
            name,
            prompt,
            runAt: runAt.toISOString(),
            frequency: freq,
            timezone,
          }
        : {
            name,
            prompt,
            cron: cronFrom(freq, runAt),
            frequency: freq,
            timezone,
          }
    try {
      const res = await fetch("/api/lookouts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = (await res.json().catch(() => ({}))) as {
        lookout?: Lookout
        scheduled?: boolean
        error?: string
      }
      // Bound to a local so the narrowing survives into the setState callback.
      const created = json.lookout
      if (!res.ok || !created) {
        toast.error(json.error ?? "Couldn't create lookout")
        return
      }
      setItems((prev) => [created, ...prev])
      setPrompt("")
      setName("")
      if (!json.scheduled) {
        toast.warning(
          "Saved, but no run time could be computed. Use Run now to test it."
        )
      } else {
        toast.success("Lookout scheduled")
      }
    } finally {
      setCreating(false)
    }
  }

  const runNow = async (l: Lookout) => {
    setBusy(l.id)
    toast.info("Running your lookout. This can take a minute or two.")
    try {
      const res = await fetch(`/api/lookouts/${l.id}/run`, { method: "POST" })
      // A gateway timeout answers with HTML, not JSON — parsing it unguarded
      // threw past this handler and the user saw nothing at all.
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        chatId?: string
        error?: string
      }
      if (json.ok && json.chatId) {
        toast.success("Done. Opening the result…")
        router.push(`/chat/${json.chatId}`)
      } else {
        toast.error(json.error ?? "Run failed")
      }
    } finally {
      setBusy(null)
    }
  }

  // Optimistic, but only until the server disagrees: a swallowed failure left
  // the row showing a state that was never saved and came back on reload.
  const toggle = async (l: Lookout) => {
    const status = l.status === "active" ? "paused" : "active"
    setItems((prev) => prev.map((x) => (x.id === l.id ? { ...x, status } : x)))
    const res = await fetch(`/api/lookouts/${l.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null)
    if (res?.ok) {
      setSettled(l.id)
      return
    }
    setItems((prev) =>
      prev.map((x) => (x.id === l.id ? { ...x, status: l.status } : x))
    )
    toast.error(
      status === "paused" ? "Couldn't pause it" : "Couldn't resume it"
    )
  }

  const remove = async (l: Lookout) => {
    setItems((prev) => prev.filter((x) => x.id !== l.id))
    const res = await fetch(`/api/lookouts/${l.id}`, {
      method: "DELETE",
    }).catch(() => null)
    if (res?.ok) return
    // Put it back where it was rather than pretending it's gone.
    setItems((prev) =>
      [...prev, l].sort((a, b) => a.name.localeCompare(b.name))
    )
    toast.error("Couldn't delete that lookout")
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6">
      <div className="mb-1 flex items-center gap-2">
        <RiRadarLine className="size-5 text-primary-strong" />
        <h1 className="font-semibold text-xl">Lookouts</h1>
      </div>
      <p className="mb-6 text-muted-foreground text-sm">
        Scheduled research that runs on its own and emails you the results.
      </p>

      {/* Create */}
      <div className="mb-8 rounded-xl border bg-card/40 p-4">
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="lk-prompt">What should MiniScira monitor?</Label>
            <Textarea
              id="lk-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. New funding rounds, launches, and research in humanoid robotics this week."
              className="min-h-20 text-sm"
            />
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="lk-name">Name (optional)</Label>
              <Input
                id="lk-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Humanoid robotics watch"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Frequency</Label>
              <div className="flex gap-1">
                {(["daily", "weekly", "once"] as Frequency[]).map((f) => (
                  <Button
                    key={f}
                    type="button"
                    size="sm"
                    variant={freq === f ? "default" : "outline"}
                    className="h-9 flex-1 capitalize"
                    onClick={() => setFreq(f)}
                  >
                    {f}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label>
                {freq === "daily"
                  ? "Time"
                  : freq === "weekly"
                    ? "Day & time"
                    : "Date & time"}
              </Label>
              <DateTimePicker
                value={runAt}
                onChange={setRunAt}
                mode={
                  freq === "daily"
                    ? "time"
                    : freq === "weekly"
                      ? "weekday"
                      : "date"
                }
              />
            </div>
            {freq === "once" && (
              <p className="pb-2 text-muted-foreground text-xs">
                Runs once at that moment.
              </p>
            )}
            <Button
              onClick={create}
              disabled={creating || !prompt.trim()}
              className="ml-auto gap-2"
            >
              <RiAddLine className="size-4" /> Create
            </Button>
          </div>
        </div>
      </div>

      {/* List */}
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground text-sm">
          No lookouts yet. Create one above and it runs on schedule.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((l) => (
            <li
              key={l.id}
              className="flex items-start gap-3 rounded-xl border bg-card/40 p-3.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-sm">{l.name}</span>
                  <span
                    className={cn(
                      "flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium text-[10px] transition-colors",
                      l.status === "active"
                        ? "bg-primary/15 text-primary-strong"
                        : "bg-muted text-muted-foreground",
                      // Confirms the change actually persisted, so an
                      // optimistic flip isn't the only feedback.
                      justSettled === l.id &&
                        "zoom-in-95 animate-in ring-1 ring-primary/40 motion-reduce:animate-none"
                    )}
                  >
                    {justSettled === l.id && (
                      <RiCheckLine className="size-2.5 shrink-0" />
                    )}
                    {l.status}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
                  {l.prompt}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {describe(l)}
                  {l.lastRunAt &&
                    ` · last run ${new Date(l.lastRunAt).toLocaleString()}`}
                  {l.nextRunAt &&
                    l.status === "active" &&
                    ` · next run ${new Date(l.nextRunAt).toLocaleString()}`}
                  {!l.nextRunAt && l.status === "active" && " · not scheduled"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5"
                  disabled={busy === l.id}
                  onClick={() => runNow(l)}
                >
                  {busy === l.id ? "Running…" : "Run now"}
                </Button>
                {l.status !== "completed" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label={l.status === "active" ? "Pause" : "Resume"}
                    onClick={() => toggle(l)}
                  >
                    {l.status === "active" ? (
                      <RiPauseLine className="size-4" />
                    ) : (
                      <RiPlayLine className="size-4" />
                    )}
                  </Button>
                )}
                <ConfirmDialog
                  title="Delete this lookout?"
                  description={`“${l.name}” and its schedule will be removed. Past result chats are kept.`}
                  onConfirm={() => remove(l)}
                  trigger={
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      aria-label="Delete"
                    >
                      <RiDeleteBinLine className="size-4" />
                    </Button>
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
