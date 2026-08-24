"use client"

import {
  RiAttachmentLine,
  RiChat3Line,
  RiCheckLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiErrorWarningLine,
  RiFileTextLine,
  RiFolder3Line,
  RiImageLine,
  RiLayoutRightLine,
  RiLinkM,
} from "@remixicon/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { ResearchChat } from "@/components/research-chat"
import { Button } from "@/components/ui/button"
import { DotmHex3 } from "@/components/ui/dotm-hex-3"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useIsMobile } from "@/hooks/use-mobile"
import { useMountEffect } from "@/hooks/use-mount-effect"
import { mutateOrToast } from "@/lib/api-client"
import {
  type ChatListPagePayload,
  type ChatListRow,
  parseChatListPage,
} from "@/lib/chat-list-events"
import { hostOf, tryParseUrl } from "@/lib/urls"

/** The path part of a curated link, shown muted after its host. */
function pathOf(url: URL | null) {
  return url && url.pathname !== "/" ? url.pathname : ""
}

import { cn } from "@/lib/utils"

type ProjectDoc = {
  id: string
  kind: string
  filename: string
  status: string
  /** Set when `status` is "error": why extraction failed, shown on the row. */
  error?: string | null
  url?: string
}
type ProjectChat = ChatListRow

const DOC_ACCEPT =
  "image/*,.pdf,.txt,.md,.markdown,.csv,.json,.log,.tsv,.html,.xml,.yaml,.yml,text/*,application/pdf"

type PanelProps = {
  instructions: string
  setInstructions: (v: string) => void
  saveInstructions: () => void
  docs: ProjectDoc[]
  chats: ProjectChat[]
  chatsNextCursor: string | null
  chatsLoading: boolean
  loadMoreChats: () => void
  links: string[]
  onAddLink: (url: string) => void
  onRemoveLink: (url: string) => void
  onAddFile: () => void
  removeDoc: (id: string) => void
  onDelete: () => Promise<void>
}

// Curated source links: the agent fetches these directly and can expand hub
// pages (docs/blogs) with firecrawl_map.
function LinksSection({
  links,
  onAddLink,
  onRemoveLink,
}: Pick<PanelProps, "links" | "onAddLink" | "onRemoveLink">) {
  const [draft, setDraft] = useState("")

  const add = () => {
    const value = draft.trim()
    if (!value) return
    const url = value.startsWith("http") ? value : `https://${value}`
    if (!tryParseUrl(url)) {
      toast.error("That doesn't look like a URL")
      return
    }
    onAddLink(url)
    setDraft("")
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor="proj-link">Links</Label>
      <div className="flex gap-1.5">
        <Input
          id="proj-link"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              add()
            }
          }}
          placeholder="https://docs.example.com"
          className="h-8 font-mono text-xs"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0"
          onClick={add}
          disabled={!draft.trim()}
        >
          Add
        </Button>
      </div>
      {links.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Pages you want the agent to treat as sources.
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {links.map((l) => (
            <li
              key={l}
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
            >
              <RiLinkM className="size-4 shrink-0 text-muted-foreground" />
              <a
                href={l}
                target="_blank"
                rel="noreferrer noopener"
                className="min-w-0 flex-1 truncate hover:underline"
                title={l}
              >
                {hostOf(l)}
                <span className="text-muted-foreground">
                  {pathOf(tryParseUrl(l))}
                </span>
              </a>
              <button
                type="button"
                onClick={() => onRemoveLink(l)}
                aria-label={`Remove ${l}`}
                className="text-muted-foreground opacity-0 transition hover:text-foreground focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
              >
                <RiCloseLine className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Shared between the desktop right panel and the mobile drawer.
function ProjectPanelContent({
  instructions,
  setInstructions,
  saveInstructions,
  docs,
  chats,
  chatsNextCursor,
  chatsLoading,
  loadMoreChats,
  links,
  onAddLink,
  onRemoveLink,
  onAddFile,
  removeDoc,
  onDelete,
}: PanelProps) {
  return (
    <>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="proj-inst">Custom instructions</Label>
        <Textarea
          id="proj-inst"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          onBlur={saveInstructions}
          placeholder="e.g. Focus on peer-reviewed sources. Prefer 2025–2026 data. Answer in British English."
          className="min-h-32 text-sm"
        />
        <p className="text-muted-foreground text-xs">
          Applied to every chat in this project.
        </p>
      </div>

      <LinksSection
        links={links}
        onAddLink={onAddLink}
        onRemoveLink={onRemoveLink}
      />

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Files</Label>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={onAddFile}
          >
            <RiAttachmentLine className="size-3.5" /> Add
          </Button>
        </div>
        {docs.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-center text-muted-foreground text-xs">
            No files yet. Anything you add here becomes searchable in chats.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {docs.map((d) => (
              <li
                key={d.id}
                className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
              >
                {d.kind === "image" ? (
                  <RiImageLine className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <RiFileTextLine className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate">{d.filename}</span>
                {d.status === "processing" && (
                  <DotmHex3
                    size={12}
                    dotSize={1.5}
                    className="text-muted-foreground"
                  />
                )}
                {d.status === "ready" && d.kind !== "image" && (
                  <RiCheckLine className="size-3.5 shrink-0 text-primary-strong" />
                )}
                {/* A failed document is excluded from search by the
                    `isNotNull(content)` filter in `search_documents`, so
                    without this it sits in the list looking healthy and the
                    only symptom is an agent that never cites it. The upload
                    toast has been gone since the last page load. */}
                {d.status === "error" && (
                  <span
                    title={
                      d.error
                        ? `Not searchable — ${d.error} Remove it and upload again.`
                        : "Not searchable. Remove it and upload again."
                    }
                    className="flex shrink-0 items-center gap-1 text-destructive text-xs"
                  >
                    <RiErrorWarningLine className="size-3.5" />
                    Not searchable
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeDoc(d.id)}
                  aria-label={`Remove ${d.filename}`}
                  className="text-muted-foreground opacity-0 transition hover:text-foreground focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
                >
                  <RiCloseLine className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(chats.length > 0 || chatsNextCursor) && (
        <div className="flex min-w-0 flex-col gap-2">
          <Label>Chats</Label>
          <ul className="flex flex-col gap-0.5">
            {chats.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/chat/${c.id}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                >
                  <RiChat3Line className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                </Link>
              </li>
            ))}
          </ul>
          {chatsNextCursor && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              disabled={chatsLoading}
              onClick={loadMoreChats}
            >
              {chatsLoading ? "Loading…" : "Load older chats"}
            </Button>
          )}
        </div>
      )}

      <div className="mt-auto border-t pt-3">
        <ConfirmDialog
          title="Delete this project?"
          description="Its chats and files are kept, but they lose the project's custom instructions and grouping. This can't be undone."
          onConfirm={onDelete}
          trigger={
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-destructive hover:text-destructive"
            >
              <RiDeleteBinLine className="size-4" /> Delete project
            </Button>
          }
        />
      </div>
    </>
  )
}

export function ProjectView({
  projectId,
  initialName,
  initialInstructions,
  initialLinks,
}: {
  projectId: string
  initialName: string
  initialInstructions: string
  initialLinks: string[]
}) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [instructions, setInstructions] = useState(initialInstructions)
  const [savedInstructions, setSavedInstructions] =
    useState(initialInstructions)
  const [links, setLinks] = useState<string[]>(initialLinks)
  const [docs, setDocs] = useState<ProjectDoc[]>([])
  const [chats, setChats] = useState<ProjectChat[]>([])
  const [chatsNextCursor, setChatsNextCursor] = useState<string | null>(null)
  const [chatsLoading, setChatsLoading] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const isMobile = useIsMobile()
  // Keep the side panel out of the resizable group on mobile — it would take a
  // slice of the group's width even while CSS-hidden.
  const showPanel = panelOpen && !isMobile
  const fileRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        if (Array.isArray(d.documents)) setDocs(d.documents)
        const page = parseChatListPage(d)
        if (page) {
          setChats(page.chats)
          setChatsNextCursor(page.nextCursor)
        }
      })
      .catch(() => {})
  }, [projectId])

  const loadMoreChats = useCallback(() => {
    if (!chatsNextCursor || chatsLoading) return
    setChatsLoading(true)
    fetch(
      `/api/projects/${projectId}?cursor=${encodeURIComponent(chatsNextCursor)}`
    )
      .then(async (response) =>
        response.ok ? parseChatListPage(await response.json()) : null
      )
      .then((page: ChatListPagePayload | null) => {
        if (!page) {
          toast.error("Couldn't load older chats")
          return
        }
        setChats((current) => {
          const seen = new Set(current.map((chat) => chat.id))
          return [
            ...current,
            ...page.chats.filter((chat) => !seen.has(chat.id)),
          ].slice(0, 300)
        })
        setChatsNextCursor(page.nextCursor)
      })
      .catch(() => toast.error("Couldn't load older chats"))
      .finally(() => setChatsLoading(false))
  }, [chatsLoading, chatsNextCursor, projectId])

  // Mount-only: a different project is a different route, so it remounts.
  useMountEffect(() => {
    load()
  })

  const patch = useCallback(
    async (body: {
      name?: string
      instructions?: string
      links?: string[]
    }) => {
      const ok = await mutateOrToast(`/api/projects/${projectId}`, {
        method: "PATCH",
        body,
        errorMessage: "Couldn't save the project. Try again.",
      })
      router.refresh()
      return ok
    },
    [projectId, router]
  )

  const saveName = () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === initialName) return
    void patch({ name: trimmed })
  }

  const saveInstructions = async () => {
    if (instructions === savedInstructions) return
    // Confirm only what actually saved: this used to toast success the moment
    // the request was fired, so a rejected save still read as "Instructions
    // saved" and the reader had no idea their edit was gone.
    const previous = savedInstructions
    setSavedInstructions(instructions)
    if (await patch({ instructions })) toast.success("Instructions saved")
    else setSavedInstructions(previous)
  }

  const uploadFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const body = new FormData()
      body.set("file", file)
      body.set("projectId", projectId)
      const res = await fetch("/api/documents", { method: "POST", body })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) toast.error(json.error ?? `Couldn't upload ${file.name}`)
    }
    load()
  }

  const removeDoc = async (id: string) => {
    const previous = docs
    setDocs((prev) => prev.filter((d) => d.id !== id))
    // Optimistic, but reversible: a failed delete puts the row back rather than
    // leaving the list disagreeing with the server until the next reload.
    if (
      !(await mutateOrToast(`/api/documents/${id}`, {
        method: "DELETE",
        errorMessage: "Couldn't delete that document.",
      }))
    )
      setDocs(previous)
  }

  const addLink = (url: string) => {
    if (links.includes(url)) return
    const next = [...links, url]
    setLinks(next)
    void patch({ links: next })
  }

  const removeLink = (url: string) => {
    const next = links.filter((l) => l !== url)
    setLinks(next)
    void patch({ links: next })
  }

  const deleteProject = async () => {
    // Navigate only on a confirmed delete. Leaving for /projects regardless
    // told the reader it had worked and then showed the project still there.
    const ok = await mutateOrToast(`/api/projects/${projectId}`, {
      method: "DELETE",
      errorMessage: "Couldn't delete the project.",
    })
    if (!ok) return
    router.push("/projects")
    router.refresh()
  }

  const panelProps = {
    instructions,
    setInstructions,
    saveInstructions,
    docs,
    chats,
    chatsNextCursor,
    chatsLoading,
    loadMoreChats,
    links,
    onAddLink: addLink,
    onRemoveLink: removeLink,
    onAddFile: () => fileRef.current?.click(),
    removeDoc: (id: string) => void removeDoc(id),
    onDelete: deleteProject,
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      {/* Main pane: slim bar + the project-scoped research surface */}
      <ResizablePanel
        id="project-main"
        minSize={420}
        className="flex min-w-0 flex-col"
      >
        <div className="flex h-12 shrink-0 items-center gap-2 px-4 md:px-6">
          <RiFolder3Line className="size-4 shrink-0 text-primary-strong" />
          {/* Inline-editable title — no dialog, no double rendering. */}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur()
            }}
            aria-label="Project name"
            placeholder="Untitled project"
            className="-ml-1 w-full max-w-72 truncate rounded-md px-1.5 py-0.5 font-medium text-foreground text-sm outline-none placeholder:text-muted-foreground hover:bg-muted/40 focus-visible:border-ring focus-visible:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring"
          />
          {/* Single hidden file input shared by both panel variants. */}
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={DOC_ACCEPT}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void uploadFiles(e.target.files)
              e.target.value = ""
            }}
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={
                    panelOpen ? "Hide project panel" : "Show project panel"
                  }
                  className="ml-auto size-8 text-muted-foreground hover:text-foreground max-md:hidden"
                  onClick={() => setPanelOpen((v) => !v)}
                />
              }
            >
              <RiLayoutRightLine
                className={cn(
                  "size-4 transition-opacity",
                  !panelOpen && "opacity-60"
                )}
              />
            </TooltipTrigger>
            <TooltipContent side="left">
              {panelOpen ? "Hide" : "Show"} project panel
            </TooltipContent>
          </Tooltip>
          {/* Mobile: same settings in a bottom drawer. */}
          <Drawer>
            <DrawerTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Project settings"
                className="ml-auto size-8 text-muted-foreground hover:text-foreground md:hidden"
              >
                <RiLayoutRightLine className="size-4" />
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader className="sr-only">
                <DrawerTitle>Project settings</DrawerTitle>
                <DrawerDescription>
                  Instructions, files, and chats for this project.
                </DrawerDescription>
              </DrawerHeader>
              <div className="flex max-h-[75vh] flex-col gap-6 overflow-y-auto p-4">
                <ProjectPanelContent {...panelProps} />
              </div>
            </DrawerContent>
          </Drawer>
        </div>
        <div className="min-h-0 flex-1">
          <ResearchChat
            projectId={projectId}
            projectInstructions={savedInstructions}
            projectLinks={links}
          />
        </div>
      </ResizablePanel>

      {/* Right panel: project settings living beside the chat, not over it.
          Desktop only — below md the same content lives in the drawer above. */}
      {showPanel && (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel
            id="project-panel"
            defaultSize={320}
            minSize={260}
            maxSize={520}
          >
            <aside className="flex h-full min-w-0 flex-col gap-6 overflow-y-auto overflow-x-hidden border-l bg-sidebar/50 p-4">
              <ProjectPanelContent {...panelProps} />
            </aside>
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  )
}
