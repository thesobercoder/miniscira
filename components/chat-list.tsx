"use client"

import { RiDeleteBinLine } from "@remixicon/react"
import { isToday, isYesterday } from "date-fns"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
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

type ChatRow = { id: string; title: string; updatedAt: string | Date }

function bucket(date: Date) {
  if (isToday(date)) return "Today"
  if (isYesterday(date)) return "Yesterday"
  return "Earlier"
}

const ORDER = ["Today", "Yesterday", "Earlier"] as const

function DeleteChat({ id, title }: { id: string; title: string }) {
  const pathname = usePathname()
  const router = useRouter()
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
    // Deleting a chat you are not looking at never navigates, so the dialog has
    // to be closed here — leaving it open stranded it with Delete disabled.
    setOpen(false)
    setBusy(false)
    if (pathname === `/chat/${id}`) router.push("/")
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
            onClick={(e) => {
              e.preventDefault()
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

export function ChatList({ chats }: { chats: ChatRow[] }) {
  const pathname = usePathname()
  const [rows, setRows] = useState<ChatRow[]>(chats)

  // Server-rendered data wins whenever the layout re-renders.
  useEffect(() => {
    setRows(chats)
  }, [chats])

  // New chats are surfaced optimistically: research-chat dispatches these
  // events the moment a chat row exists, so the sidebar updates without a
  // router.refresh(). Refreshing mid-turn would re-fetch /chat/<id>, swap the
  // home page for the chat-route page, remount the conversation component and
  // kill the live eve stream ("eve stream error: network error").
  useEffect(() => {
    const created = (e: Event) => {
      const detail = (e as CustomEvent<ChatRow>).detail
      setRows((prev) =>
        prev.some((c) => c.id === detail.id) ? prev : [detail, ...prev]
      )
    }
    const titled = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; title: string }>).detail
      setRows((prev) =>
        prev.map((c) => (c.id === detail.id ? { ...c, title: detail.title } : c))
      )
    }
    window.addEventListener("miniscira:chat-created", created)
    window.addEventListener("miniscira:chat-titled", titled)
    return () => {
      window.removeEventListener("miniscira:chat-created", created)
      window.removeEventListener("miniscira:chat-titled", titled)
    }
  }, [])

  if (rows.length === 0) {
    return (
      <p className="text-pretty px-2 py-1.5 text-muted-foreground text-xs">
        No research yet. Ask a question to start.
      </p>
    )
  }

  const groups = new Map<string, ChatRow[]>()
  for (const c of rows) {
    const key = bucket(new Date(c.updatedAt))
    const group = groups.get(key)
    if (group) group.push(c)
    else groups.set(key, [c])
  }

  return (
    <>
      {/* flatMap so each bucket is looked up once and its rows are in hand. */}
      {ORDER.flatMap((group) => {
        const rows = groups.get(group)
        if (!rows?.length) return []
        return (
          <div key={group} className="mb-1">
            <SidebarGroupLabel>{group}</SidebarGroupLabel>
            <SidebarMenu>
              {rows.map((c) => (
                <SidebarMenuItem key={c.id}>
                  <SidebarMenuButton
                    render={<Link href={`/chat/${c.id}`} />}
                    isActive={pathname === `/chat/${c.id}`}
                    tooltip={c.title}
                  >
                    <span className="truncate">{c.title}</span>
                  </SidebarMenuButton>
                  <DeleteChat id={c.id} title={c.title} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </div>
        )
      })}
    </>
  )
}
