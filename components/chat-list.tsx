"use client"

import { RiDeleteBinLine } from "@remixicon/react"
import { isToday, isYesterday } from "date-fns"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  useCallback,
  // biome-ignore lint/style/noRestrictedImports: cursor paging, observers, and route metadata synchronize external browser systems
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react"
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
import {
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useMountEffect } from "@/hooks/use-mount-effect"
import {
  CHAT_CREATED_EVENT,
  CHAT_TITLED_EVENT,
  type ChatListPagePayload,
  type ChatListRow,
  createHistoryWindow,
  historyRows,
  historyWindowReducer,
  nextHistoryIntent,
  parseChatListPage,
  parseCurrentChat,
  reloadHistoryIntent,
  renderedHistorySlots,
  scrollAnchorDelta,
} from "@/lib/chat-list-events"
import { chatPath } from "@/lib/chat-route"

type ChatRow = ChatListRow

function bucket(date: Date) {
  if (isToday(date)) return "Today"
  if (isYesterday(date)) return "Yesterday"
  return "Earlier"
}

const ORDER = ["Today", "Yesterday", "Earlier"] as const

function DeleteChat({
  id,
  title,
  onDeleted,
}: {
  id: string
  title: string
  onDeleted: (id: string) => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  async function remove() {
    setBusy(true)
    const res = await fetch(`/api/chats/${id}`, { method: "DELETE" }).catch(
      () => null
    )
    if (!res?.ok) {
      toast.error("Couldn't delete that chat")
      setBusy(false)
      return
    }
    toast.success("Chat deleted")
    setOpen(false)
    setBusy(false)
    onDeleted(id)
    if (pathname === chatPath(id)) {
      router.replace("/")
      return
    }
    router.refresh()
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<SidebarMenuAction showOnHover aria-label="Delete chat" />}
      >
        <RiDeleteBinLine />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
          <AlertDialogDescription className="text-pretty">
            “{title}” and its messages will be permanently removed. This can't
            be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              event.preventDefault()
              void remove()
            }}
            className="bg-destructive text-white transition-transform hover:bg-destructive/90 active:scale-[0.96]"
          >
            {busy ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ChatRows({
  rows,
  pathname,
  onDeleted,
}: {
  rows: ChatRow[]
  pathname: string
  onDeleted: (id: string) => void
}) {
  const groups = new Map<string, ChatRow[]>()
  for (const chat of rows) {
    const key = bucket(new Date(chat.updatedAt))
    const group = groups.get(key)
    if (group) group.push(chat)
    else groups.set(key, [chat])
  }

  return ORDER.flatMap((group) => {
    const groupRows = groups.get(group)
    if (!groupRows?.length) return []
    return (
      <div key={group} className="mb-1">
        <SidebarGroupLabel>{group}</SidebarGroupLabel>
        <SidebarMenu>
          {groupRows.map((chat) => (
            <SidebarMenuItem key={chat.id}>
              <SidebarMenuButton
                render={<Link href={chatPath(chat.id)} />}
                isActive={pathname === chatPath(chat.id)}
                tooltip={chat.title}
              >
                <span className="truncate">{chat.title}</span>
              </SidebarMenuButton>
              <DeleteChat
                id={chat.id}
                title={chat.title}
                onDeleted={onDeleted}
              />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </div>
    )
  })
}

export function ChatList({
  initialPage,
}: {
  initialPage: ChatListPagePayload
}) {
  const pathname = usePathname()
  const { chats, nextCursor } = initialPage
  const page = useMemo<ChatListPagePayload>(
    () => ({ chats, nextCursor }),
    [chats, nextCursor]
  )
  const generation = JSON.stringify(page)
  const [history, dispatch] = useReducer(
    historyWindowReducer,
    { generation, page },
    createHistoryWindow
  )
  const rootRef = useRef<HTMLDivElement>(null)
  const slotRefs = useRef(new Map<number, HTMLDivElement>())
  const endRef = useRef<HTMLDivElement>(null)
  const requestRef = useRef<string | null>(null)
  const anchorRef = useRef<{
    slot: number
    top: number
    scrollTop: number
  } | null>(null)
  const currentChatId = pathname.match(/^\/chat\/([^/]+)$/)?.[1]
  const decodedCurrentChatId = currentChatId
    ? decodeURIComponent(currentChatId)
    : null
  const currentChatIsLoaded = decodedCurrentChatId
    ? historyRows(history).some((row) => row.id === decodedCurrentChatId)
    : false

  useEffect(() => {
    dispatch({ type: "sourceChanged", generation, page })
  }, [generation, page])

  const requestPage = useCallback(
    async (slot: number, cursor: string | null) => {
      const key = `${slot}:${cursor ?? "first"}`
      if (requestRef.current === key) return
      const root = rootRef.current
      const node = slotRefs.current.get(slot)
      if (root && node) {
        anchorRef.current = {
          slot,
          top: node.getBoundingClientRect().top,
          scrollTop: root.scrollTop,
        }
      }
      requestRef.current = key
      dispatch({ type: "pageRequested", slot, cursor })
      try {
        const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""
        const response = await fetch(`/api/chats${query}`)
        const payload = response.ok
          ? parseChatListPage(await response.json())
          : null
        if (!payload) throw new Error("Couldn't load more chats")
        dispatch({ type: "pageLoaded", slot, cursor, page: payload })
      } catch (error) {
        dispatch({
          type: "pageFailed",
          slot,
          cursor,
          message:
            error instanceof Error ? error.message : "Couldn't load more chats",
        })
      } finally {
        requestRef.current = null
      }
    },
    []
  )

  useMountEffect(() => {
    const created = (event: Event) => {
      dispatch({
        type: "chatCreated",
        row: (event as CustomEvent<ChatRow>).detail,
      })
    }
    const titled = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; title: string }>)
        .detail
      dispatch({ type: "chatTitled", ...detail })
    }
    window.addEventListener(CHAT_CREATED_EVENT, created)
    window.addEventListener(CHAT_TITLED_EVENT, titled)
    return () => {
      window.removeEventListener(CHAT_CREATED_EVENT, created)
      window.removeEventListener(CHAT_TITLED_EVENT, titled)
    }
  })

  useEffect(() => {
    if (!decodedCurrentChatId) {
      dispatch({ type: "currentChatLoaded", row: null })
      return
    }
    if (currentChatIsLoaded) {
      dispatch({ type: "currentChatLoaded", row: null })
      return
    }
    const controller = new AbortController()
    void fetch(`/api/chats/${encodeURIComponent(decodedCurrentChatId)}`, {
      signal: controller.signal,
    })
      .then(async (response) =>
        response.ok ? parseCurrentChat(await response.json()) : null
      )
      .then((row) => dispatch({ type: "currentChatLoaded", row }))
      .catch(() => undefined)
    return () => controller.abort()
  }, [decodedCurrentChatId, currentChatIsLoaded, generation])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) => right.intersectionRatio - left.intersectionRatio
          )[0]
        if (!visible) return
        const slot = Number((visible.target as HTMLElement).dataset.slot)
        dispatch({ type: "visibleSlotChanged", slot })
        const intent = reloadHistoryIntent(history, slot)
        if (intent) void requestPage(intent.slot, intent.cursor)
      },
      { root, threshold: [0.05, 0.5, 1] }
    )
    for (const node of slotRefs.current.values()) observer.observe(node)
    return () => observer.disconnect()
  }, [history, requestPage])

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const slot = Number((entry.target as HTMLElement).dataset.slot)
        dispatch({
          type: "slotMeasured",
          slot,
          height: Math.ceil(entry.contentRect.height),
        })
      }
    })
    for (const node of slotRefs.current.values()) observer.observe(node)
    return () => observer.disconnect()
  }, [history.slots.length])

  useEffect(() => {
    const root = rootRef.current
    const end = endRef.current
    if (!root || !end) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        const intent = nextHistoryIntent(history)
        if (intent) void requestPage(intent.slot, intent.cursor)
      },
      { root, rootMargin: "240px 0px" }
    )
    observer.observe(end)
    return () => observer.disconnect()
  }, [history, requestPage])

  useEffect(() => {
    if (history.load.kind !== "idle") return
    const anchor = anchorRef.current
    if (!anchor) return
    const root = rootRef.current
    const node = slotRefs.current.get(anchor.slot)
    anchorRef.current = null
    if (!root || !node) return
    const delta = scrollAnchorDelta(
      anchor.top,
      node.getBoundingClientRect().top
    )
    if (delta !== 0) root.scrollTop = anchor.scrollTop + delta
  }, [history.load])

  const rendered = renderedHistorySlots(history)
  const allRows = historyRows(history)
  const currentRows = history.currentChat ? [history.currentChat] : []
  const next = nextHistoryIntent(history)
  const failedLoad = history.load.kind === "error" ? history.load : null

  if (allRows.length === 0 && currentRows.length === 0 && !next) {
    return (
      <p className="text-pretty px-2 py-1.5 text-muted-foreground text-xs">
        No research yet. Ask a question to start.
      </p>
    )
  }

  return (
    <div ref={rootRef} className="min-h-0 flex-1 overflow-y-auto">
      {currentRows.length > 0 && (
        <ChatRows
          rows={currentRows}
          pathname={pathname}
          onDeleted={(id) => dispatch({ type: "chatDeleted", id })}
        />
      )}
      {rendered.map(({ slot, index }) => (
        <div
          key={slot.key}
          data-slot={index}
          ref={(node) => {
            if (node) slotRefs.current.set(index, node)
            else slotRefs.current.delete(index)
          }}
        >
          {slot.kind === "loaded" ? (
            <ChatRows
              rows={slot.rows}
              pathname={pathname}
              onDeleted={(id) => dispatch({ type: "chatDeleted", id })}
            />
          ) : (
            <button
              type="button"
              className="w-full rounded-md px-2 text-left text-muted-foreground text-xs hover:bg-sidebar-accent"
              style={{ minHeight: slot.estimatedHeight }}
              onClick={() => {
                const intent = reloadHistoryIntent(history, index)
                if (intent) void requestPage(intent.slot, intent.cursor)
              }}
            >
              Load {slot.rowCount} older chats
            </button>
          )}
        </div>
      ))}
      {failedLoad ? (
        <button
          type="button"
          className="w-full px-2 py-2 text-left text-destructive text-xs"
          onClick={() => void requestPage(failedLoad.slot, failedLoad.cursor)}
        >
          {failedLoad.message}. Retry
        </button>
      ) : next ? (
        <button
          type="button"
          className="w-full px-2 py-2 text-left text-muted-foreground text-xs"
          disabled={history.load.kind === "loading"}
          onClick={() => void requestPage(next.slot, next.cursor)}
        >
          {history.load.kind === "loading" ? "Loading…" : "Load older chats"}
        </button>
      ) : null}
      <div ref={endRef} aria-hidden className="h-px" />
    </div>
  )
}
