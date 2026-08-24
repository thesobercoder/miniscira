"use client"

import { RiChat3Line, RiSearchLine } from "@remixicon/react"
import { usePathname, useRouter } from "next/navigation"
import {
  createContext,
  useCallback,
  useContext,
  // biome-ignore lint/style/noRestrictedImports: synchronized debounced API fetch
  useEffect,
  useMemo,
  useState,
} from "react"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Kbd } from "@/components/ui/kbd"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { useMountEffect } from "@/hooks/use-mount-effect"
import { chatPath } from "@/lib/chat-route"

export const THREAD_SEARCH_SHORTCUT = "Mod+K"

type SearchKeyEvent = Pick<
  KeyboardEvent,
  | "altKey"
  | "ctrlKey"
  | "defaultPrevented"
  | "key"
  | "metaKey"
  | "repeat"
  | "shiftKey"
>

export function isThreadSearchShortcut(event: SearchKeyEvent) {
  return (
    !event.defaultPrevented &&
    !event.repeat &&
    !event.altKey &&
    !event.shiftKey &&
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === "k"
  )
}

type Result = {
  id: string
  title: string
  projectId: string | null
  updatedAt: string
  match: string
}

const ThreadSearchContext = createContext<(() => void) | null>(null)

export function ThreadSearchProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const currentChatId = /^\/chat\/([0-9a-f-]{36})$/i.exec(pathname)?.[1]
  const show = useCallback(() => {
    setQuery("")
    setResults([])
    setOpen(true)
  }, [])
  const changeOpen = useCallback((next: boolean) => {
    setOpen(next)
    if (!next) setQuery("")
  }, [])

  useMountEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isThreadSearchShortcut(event)) return
      event.preventDefault()
      show()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  })

  // `open` changes from the global shortcut and the sidebar button, while query
  // changes from the command input. Fetching is synchronization with that
  // external API state, and cleanup must abort stale debounced requests.
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError(false)
      setResults([])
      const params = new URLSearchParams({ q: query, limit: "20" })
      if (currentChatId) params.set("currentChatId", currentChatId)
      const response = await fetch(`/api/chats/search?${params}`, {
        signal: controller.signal,
      }).catch(() => null)
      if (controller.signal.aborted) return
      if (!response?.ok) {
        setResults([])
        setError(true)
      } else {
        const body = (await response.json()) as { results?: Result[] }
        setResults(body.results ?? [])
      }
      setLoading(false)
    }, 180)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [currentChatId, open, query])

  const context = useMemo(() => show, [show])
  return (
    <ThreadSearchContext.Provider value={context}>
      {children}
      <CommandDialog
        open={open}
        onOpenChange={changeOpen}
        title="Search chats"
        description="Find and open a previous chat"
        showCloseButton
        className="sm:max-w-lg"
      >
        <Command shouldFilter={false}>
          <CommandInput
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Search chats…"
          />
          <CommandList aria-busy={loading}>
            <CommandEmpty>
              {loading
                ? "Searching chats…"
                : error
                  ? "Couldn't search chats."
                  : query
                    ? "No chats found."
                    : "No previous chats."}
            </CommandEmpty>
            <CommandGroup heading={query ? "Chats" : "Recent chats"}>
              {results.map((result) => (
                <CommandItem
                  key={result.id}
                  value={result.id}
                  onSelect={() => {
                    setOpen(false)
                    router.push(chatPath(result.id))
                  }}
                >
                  <RiChat3Line />
                  <span
                    className="min-w-0 flex-1 truncate"
                    title={result.title}
                  >
                    {result.title}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </ThreadSearchContext.Provider>
  )
}

export function ThreadSearchButton() {
  const open = useContext(ThreadSearchContext)
  return (
    <SidebarMenuButton
      type="button"
      onClick={() => open?.()}
      aria-keyshortcuts="Control+K Meta+K"
      tooltip="Search chats (Ctrl/Cmd+K)"
    >
      <RiSearchLine />
      <span>Search chats</span>
      <Kbd className="ml-auto min-w-8 gap-1 px-1.5 group-data-[collapsible=icon]:hidden">
        <span aria-hidden="true">⌘</span>
        <span>K</span>
      </Kbd>
    </SidebarMenuButton>
  )
}
