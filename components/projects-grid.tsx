"use client"

import { RiAddLine, RiFolder3Line } from "@remixicon/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

type ProjectItem = { id: string; name: string; instructions: string | null }

export function ProjectsGrid({ initial }: { initial: ProjectItem[] }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const createInFlight = useRef(false)

  const create = async () => {
    if (createInFlight.current) return
    createInFlight.current = true
    setCreating(true)
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Untitled project" }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        project?: { id: string }
        error?: string
      }
      if (!res.ok || !json.project) {
        toast.error(json.error ?? "Couldn't create the project")
        return
      }
      router.push(`/projects/${json.project.id}`)
    } catch {
      toast.error("Couldn't create the project")
    } finally {
      createInFlight.current = false
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-xl">Projects</h1>
          <p className="text-muted-foreground text-sm">
            Group chats under shared custom instructions and files.
          </p>
        </div>
        <Button
          onClick={create}
          disabled={creating}
          className="gap-2 rounded-lg"
        >
          <RiAddLine className="size-4" /> New project
        </Button>
      </div>

      {initial.length === 0 ? (
        <button
          type="button"
          onClick={create}
          disabled={creating}
          className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center transition-colors hover:border-primary/40 hover:bg-muted/30"
        >
          <RiFolder3Line className="size-8 text-muted-foreground" />
          <span className="font-medium text-sm">Create your first project</span>
          <span className="text-muted-foreground text-xs">
            Add custom instructions and files the agent uses across chats.
          </span>
        </button>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {initial.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="group flex flex-col gap-2 rounded-xl border p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary-strong">
                <RiFolder3Line className="size-5" />
              </div>
              <div className="truncate font-medium text-sm">{p.name}</div>
              <p className="line-clamp-2 text-muted-foreground text-xs">
                {p.instructions?.trim() || "No custom instructions yet."}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
