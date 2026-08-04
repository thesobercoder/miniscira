"use client"

import { RiCheckLine, RiExternalLinkLine } from "@remixicon/react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useMountEffect } from "@/hooks/use-mount-effect"

// Where to find a gateway key. Self-hosted deployments usually share one
// deployment-wide key (AI_GATEWAY_API_KEY, see ALLOW_SHARED_GATEWAY_KEY), so
// this link is mostly for users who want to bring their own.
const GATEWAY_KEYS_URL = "https://miniscira.com/docs/self-host"

type State = { saved: boolean; last4: string | null }

/**
 * Paste, verify, and store the user's AI Gateway key.
 *
 * Shared by the settings page and the in-chat dialog so there is one place that
 * knows the endpoint contract and the write-only rules. The key is sent once,
 * sealed server-side and never read back: the field is cleared on save and only
 * the last four characters are shown afterwards, so a saved key cannot be
 * recovered from a screen share, a browser cache, or this component's state.
 */
export function GatewayKeyForm({ onSaved }: { onSaved?: () => void }) {
  const [state, setState] = useState<State | null>(null)
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)

  useMountEffect(() => {
    let cancelled = false
    void fetch("/api/settings/gateway-key")
      .then((r) => (r.ok ? r.json() : { saved: false, last4: null }))
      .then((d: State) => {
        if (!cancelled) setState(d)
      })
      .catch(() => {
        if (!cancelled) setState({ saved: false, last4: null })
      })
    return () => {
      cancelled = true
    }
  })

  async function save() {
    const apiKey = value.trim()
    if (!apiKey) return
    setBusy(true)
    try {
      const res = await fetch("/api/settings/gateway-key", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey }),
      })
      const data = (await res.json().catch(() => ({}))) as State & {
        error?: string
      }
      if (!res.ok) {
        // The server checked the key against the gateway, so this says what is
        // actually wrong rather than "something went wrong".
        toast.error(data.error ?? "Couldn't save that key.")
        return
      }
      setState({ saved: true, last4: data.last4 ?? null })
      setValue("")
      toast.success("Key saved. Research now runs on your gateway.")
      onSaved?.()
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      const res = await fetch("/api/settings/gateway-key", { method: "DELETE" })
      if (!res.ok) {
        toast.error("Couldn't remove that key")
        return
      }
      setState({ saved: false, last4: null })
      toast.success("Key removed")
    } finally {
      setBusy(false)
    }
  }

  if (state === null) return <Spinner />

  if (state.saved)
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
        <RiCheckLine className="size-4 shrink-0 text-primary-strong" />
        <span className="min-w-0 flex-1 text-sm">
          Key saved
          {state.last4 && (
            <span className="ml-1 font-mono text-muted-foreground text-xs">
              ····{state.last4}
            </span>
          )}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={remove}
          disabled={busy}
          className="shrink-0"
        >
          {busy && <Spinner />}
          Remove
        </Button>
      </div>
    )

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="vck_…"
        // `password`, not `text`: this is a live billing credential and should
        // not sit legible on screen while it is pasted.
        type="password"
        autoComplete="off"
        spellCheck={false}
        className="min-w-0 flex-1 font-mono"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !busy) void save()
        }}
      />
      <Button onClick={save} disabled={busy || !value.trim()}>
        {busy && <Spinner />}
        Save key
      </Button>
    </div>
  )
}

/** The "where do I get one" line, shared by both surfaces. */
export function GatewayKeyHint() {
  return (
    <>
      Research runs on your own{" "}
      <a
        href={GATEWAY_KEYS_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground"
      >
        Vercel AI Gateway
        <RiExternalLinkLine className="size-3.5" />
      </a>
      , billed to your team. The key is encrypted and never shown again.
    </>
  )
}
