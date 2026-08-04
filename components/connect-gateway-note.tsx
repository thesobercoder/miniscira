"use client"

import { RiCloseLine } from "@remixicon/react"
import type { ReactNode } from "react"
import { useState } from "react"

import { GatewayKeyForm, GatewayKeyHint } from "@/components/gateway-key-form"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { VercelMark } from "@/components/vercel-mark"
import { useIsMobile } from "@/hooks/use-mobile"
import { useMountEffect } from "@/hooks/use-mount-effect"
import { cn } from "@/lib/utils"

const TITLE = "Add your AI Gateway key"

/**
 * The key form, opened from the composer without leaving the chat.
 *
 * Drawer on mobile, dialog on desktop — the same split `project-view` uses, so
 * a bottom sheet is what a thumb gets and a centred modal is what a pointer
 * gets. Both wrap the identical `GatewayKeyForm`.
 */
function GatewayKeyPrompt({ onSaved }: { onSaved: () => void }) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)

  // Close on save, then tell the notice to disappear. Reversed, the dialog
  // would be unmounted mid-transition by its own parent vanishing.
  const saved = () => {
    setOpen(false)
    onSaved()
  }

  const trigger = (
    <Button size="sm" className="h-8 shrink-0 gap-1.5 shadow-xs">
      <VercelMark className="size-3" /> Add key
    </Button>
  )

  if (isMobile)
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{TITLE}</DrawerTitle>
            <DrawerDescription className="text-pretty">
              <GatewayKeyHint />
            </DrawerDescription>
          </DrawerHeader>
          <div className="p-4 pt-0">
            <GatewayKeyForm onSaved={saved} />
          </div>
        </DrawerContent>
      </Drawer>
    )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* `render`, not `asChild`: Dialog is Base UI while Drawer above is vaul,
          so the two composition APIs genuinely differ here. */}
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{TITLE}</DialogTitle>
          <DialogDescription className="text-pretty">
            <GatewayKeyHint />
          </DialogDescription>
        </DialogHeader>
        <GatewayKeyForm onSaved={saved} />
      </DialogContent>
    </Dialog>
  )
}

/**
 * Wraps the composer with a notice for users who have no gateway credential.
 *
 * Reachable for anyone who has not saved a key yet, whichever provider they
 * signed in with — the check is `hasGatewayCredential`, which looks only at the
 * stored key and the shared-key escape hatch. Without this the first symptom is
 * a turn that fails *after* they have typed a question.
 *
 * A wrapper rather than a sibling so the notice can sit inside the composer's
 * own container — one raised card with the message on top and the input below,
 * instead of two floating boxes that happen to be adjacent. The composer keeps
 * its `bg-background`, so it reads as the live surface and the notice as the
 * tray behind it.
 */
export function ComposerNotice({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState<boolean | null>(null)
  // Session-scoped, not persisted: the notice is describing a thing that is
  // still broken, so it should come back on the next visit. Dismissing gets it
  // out of the way now without pretending the account is set up.
  const [dismissed, setDismissed] = useState(false)

  useMountEffect(() => {
    let cancelled = false
    void fetch("/api/gateway")
      .then((res) => (res.ok ? res.json() : { connected: true }))
      .then((data: { connected?: boolean }) => {
        // Default to `true` on a failed check: a transient error must not
        // accuse someone of not having connected an account they did connect.
        if (!cancelled) setConnected(data.connected ?? true)
      })
      .catch(() => {
        if (!cancelled) setConnected(true)
      })
    return () => {
      cancelled = true
    }
  })

  const show = connected === false && !dismissed
  if (!show) return <>{children}</>

  return (
    <div
      className={cn(
        "rounded-xl bg-muted/90 pt-1",
        "fade-in-0 slide-in-from-bottom-1 animate-in duration-200 ease-out-strong"
      )}
    >
      {/* Same shape as the sign-in page: one line of consequence, one accented
          action, nothing else competing. The Connect button is the only lime
          thing here for the same reason "Continue with Vercel" is the only lime
          thing there — it is the single default, and the message exists to
          explain it rather than to be read on its own. */}
      <div className="flex items-center gap-2 py-1.5 pr-1.5 pl-3">
        {/* One line, wrapping rather than truncating. A second line of detail
            got clipped to "Runs on your own AI Gateway, billed to…" the moment
            the container narrowed, and the sign-in page already explains the
            billing — repeating it in a strip this size is noise, not context. */}
        <p className="min-w-0 flex-1 text-pretty font-medium text-foreground text-sm">
          Add your AI Gateway key to start researching
        </p>
        {/* Inline rather than a link to /settings: the user is mid-thought
            with a question to ask, and sending them to another page to paste a
            key means coming back to an empty composer. */}
        <GatewayKeyPrompt onSaved={() => setConnected(true)} />
        <button
          type="button"
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => setDismissed(true)}
        >
          <RiCloseLine className="size-4" />
        </button>
      </div>
      {children}
    </div>
  )
}
