"use client"

import { RiDeleteBinLine, RiRestartLine } from "@remixicon/react"
import { format, isToday, isYesterday } from "date-fns"
import { useCallback, useState } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { useMountEffect } from "@/hooks/use-mount-effect"

type MemoryRow = { id: string; content: string; createdAt: string | Date }

// Same buckets the chat list uses for recency, with an explicit date once a
// memory is older than that — "when did it learn this" is the useful part.
function learnedAt(date: Date) {
  if (isToday(date)) return "Learned today"
  if (isYesterday(date)) return "Learned yesterday"
  return `Learned ${format(date, "d MMM yyyy")}`
}

function DeleteMemory({
  content,
  onConfirm,
}: {
  content: string
  onConfirm: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
            aria-label="Forget this"
          />
        }
      >
        <RiDeleteBinLine className="size-4" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Forget this?</AlertDialogTitle>
          <AlertDialogDescription className="text-pretty">
            “{content}” will be permanently removed and won't inform future
            answers. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault()
              setBusy(true)
              void onConfirm().finally(() => setBusy(false))
            }}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            Forget
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function SettingsMemories() {
  const [memories, setMemories] = useState<MemoryRow[] | null>(null)
  // Kept apart from `memories: []`. Collapsing the two told the reader their
  // memories were empty when the request had simply failed.
  const [failed, setFailed] = useState(false)

  // Loaded client-side so a delete can update the list in place without a
  // round trip through the server component that renders this section.
  const load = useCallback(async () => {
    setFailed(false)
    setMemories(null)
    try {
      const res = await fetch("/api/memories", { cache: "no-store" })
      const json = (await res.json().catch(() => null)) as {
        memories?: MemoryRow[]
      } | null
      if (!res.ok || !Array.isArray(json?.memories)) throw new Error("load")
      setMemories(json.memories)
    } catch {
      setFailed(true)
    }
  }, [])

  useMountEffect(() => {
    void load()
  })

  // The row only leaves the list once the database has actually dropped it —
  // an optimistic removal here would show an empty list over a full table.
  const forget = async (id: string) => {
    const res = await fetch(`/api/memories/${id}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error("Couldn't forget that")
      return
    }
    setMemories((prev) => prev?.filter((m) => m.id !== id) ?? prev)
    toast.success("Forgotten")
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-foreground text-sm">
          What MiniScira remembers
        </h2>
        <p className="text-muted-foreground text-sm">
          Facts the assistant has picked up about you. They inform every
          conversation, so remove anything that's wrong or out of date.
        </p>
      </div>

      {failed ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            Couldn&apos;t load your memories.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            className="gap-1.5 transition-transform active:scale-[0.96]"
          >
            <RiRestartLine className="size-3.5" /> Try again
          </Button>
        </div>
      ) : memories === null ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : memories.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground text-sm">
          Nothing remembered yet. Tell the assistant something worth keeping and
          it'll show up here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {memories.map((m) => (
            <li
              key={m.id}
              className="flex items-start gap-3 rounded-xl border bg-card/40 p-3.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-pretty text-foreground text-sm">
                  {m.content}
                </p>
                <p className="mt-0.5 text-muted-foreground text-xs">
                  {learnedAt(new Date(m.createdAt))}
                </p>
              </div>
              <DeleteMemory
                content={m.content}
                onConfirm={() => forget(m.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
