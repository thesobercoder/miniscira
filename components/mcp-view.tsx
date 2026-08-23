"use client"

import {
  RiAddLine,
  RiCheckLine,
  RiDeleteBinLine,
  RiExternalLinkLine,
  RiKey2Line,
  RiPlugLine,
  RiPulseLine,
} from "@remixicon/react"
import { useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { mutateOrToast } from "@/lib/api-client"
import {
  MCP_CATALOG,
  type McpAuthType,
  type McpCatalogEntry,
} from "@/lib/mcp-catalog"
import { authActionFor } from "@/lib/mcp-ui"
import { cn } from "@/lib/utils"

const AUTH_LABEL: Record<McpAuthType, string> = {
  none: "No auth",
  header: "API key",
  oauth: "OAuth",
}

function CatalogIcon({ icon }: { icon?: string }) {
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white shadow-xs ring-1 ring-border/60">
      {icon ? (
        // biome-ignore lint/performance/noImgElement: tiny external brand svg
        <img src={icon} alt="" className="size-4.5" />
      ) : (
        <RiPlugLine className="size-4 text-neutral-500" />
      )}
    </div>
  )
}

type McpServerItem = {
  id: string
  name: string
  url: string
  transport: string
  // Names only — the server never returns header values (they're credentials).
  headerNames: string[]
  enabled: boolean
  authorized: boolean
  hasOAuthClient: boolean
  oauthClientId: string | null
  offersOAuth: boolean
}

type Transport = "http" | "sse"
type AddTab = "manual" | "browse"

export function McpView({ initial }: { initial: McpServerItem[] }) {
  const [items, setItems] = useState(initial)
  const [creating, setCreating] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [configuringOAuth, setConfiguringOAuth] = useState<string | null>(null)
  const [oauthClientId, setOAuthClientId] = useState("")
  const [oauthClientSecret, setOAuthClientSecret] = useState("")
  const [addTab, setAddTab] = useState<AddTab>("manual")

  const connect = async (s: McpServerItem) => {
    setConnecting(s.id)
    try {
      const res = await fetch(`/api/mcp/${s.id}/auth`, { method: "POST" })
      const json = (await res.json().catch(() => ({}))) as {
        authorized?: boolean
        url?: string
        error?: string
        needsClient?: boolean
      }
      if (json.authorized) {
        setItems((prev) =>
          prev.map((x) => (x.id === s.id ? { ...x, authorized: true } : x))
        )
        toast.success(`${s.name}: already authorized`)
      } else if (json.url) {
        // Absolute external URL (the OAuth identity provider) — not an internal route.
        window.location.href = json.url
      } else {
        toast.error(json.error ?? "Couldn't start authorization")
        if (json.needsClient) setConfiguringOAuth(s.id)
      }
    } finally {
      setConnecting(null)
    }
  }

  const saveOAuthClient = async (s: McpServerItem) => {
    const clientId = oauthClientId.trim()
    if (!clientId) return
    const res = await fetch(`/api/mcp/${s.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        oauthClientId: clientId,
        oauthClientSecret: oauthClientSecret.trim() || undefined,
      }),
    })
    const json = (await res.json().catch(() => ({}))) as {
      server?: McpServerItem
      error?: string
    }
    if (!res.ok || !json.server) {
      toast.error(json.error ?? "Couldn't save OAuth client")
      return
    }
    const updated = json.server
    setItems((prev) => prev.map((item) => (item.id === s.id ? updated : item)))
    setOAuthClientId("")
    setOAuthClientSecret("")
    setConfiguringOAuth(null)
    toast.success(`${s.name}: OAuth client saved securely`)
  }

  const toggleAdvanced = (s: McpServerItem) => {
    const opening = configuringOAuth !== s.id
    setConfiguringOAuth(opening ? s.id : null)
    setOAuthClientId(opening ? (s.oauthClientId ?? "") : "")
    setOAuthClientSecret("")
  }

  const disconnect = async (s: McpServerItem) => {
    setItems((prev) =>
      prev.map((x) => (x.id === s.id ? { ...x, authorized: false } : x))
    )
    const res = await fetch(`/api/mcp/${s.id}/auth`, {
      method: "DELETE",
    }).catch(() => null)
    if (res?.ok) {
      toast.success(`${s.name}: disconnected`)
      return
    }
    // The credential is still live server-side, so showing it as disconnected
    // would be a lie the next tool call exposes.
    setItems((prev) =>
      prev.map((x) => (x.id === s.id ? { ...x, authorized: true } : x))
    )
    toast.error(`Couldn't disconnect ${s.name}`)
  }

  // add form
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [transport, setTransport] = useState<Transport>("http")
  const [headerKey, setHeaderKey] = useState("")
  const [headerValue, setHeaderValue] = useState("")
  const [headerPlaceholder, setHeaderPlaceholder] = useState("Bearer …")

  const addServer = async (
    payload: {
      name: string
      url: string
      transport: Transport
      headers?: Record<string, string>
      authType?: McpAuthType
    },
    successMessage: string
  ) => {
    setCreating(true)
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = (await res.json().catch(() => ({}))) as {
        server?: McpServerItem
        error?: string
      }
      // Bound to a local so the narrowing survives into the setState callback.
      const added = json.server
      if (!res.ok || !added) {
        toast.error(json.error ?? "Couldn't add server")
        return
      }
      setItems((prev) => [added, ...prev])
      toast.success(successMessage)
    } finally {
      setCreating(false)
    }
  }

  const create = async () => {
    if (!name.trim() || !url.trim()) return
    const headers =
      headerKey.trim() && headerValue.trim()
        ? { [headerKey.trim()]: headerValue.trim() }
        : undefined
    await addServer(
      {
        name,
        url,
        transport,
        headers,
        authType: headers ? "header" : undefined,
      },
      "MCP server added. Hit Test to check the connection."
    )
    setName("")
    setUrl("")
    setHeaderKey("")
    setHeaderValue("")
    setHeaderPlaceholder("Bearer …")
  }

  const inCatalogAlready = (entry: McpCatalogEntry) =>
    items.some((x) => x.url === entry.url)

  const authAction = (server: McpServerItem) => authActionFor(server)

  // No-auth and OAuth entries need nothing from the user up front — add them
  // directly. OAuth still requires hitting Connect afterward to authorize.
  const addFromCatalog = async (entry: McpCatalogEntry) => {
    if (inCatalogAlready(entry)) return
    await addServer(
      {
        name: entry.name,
        url: entry.url,
        transport: entry.transport,
        authType: entry.authType,
      },
      entry.authType === "oauth"
        ? `${entry.name} added — hit Connect below to authorize.`
        : `${entry.name} added. Hit Test to check the connection.`
    )
  }

  // API-key entries need a secret only the user has, so prefill the manual
  // form instead of guessing — they paste the value and hit Add themselves.
  const prefillForHeader = (entry: McpCatalogEntry) => {
    if (inCatalogAlready(entry)) return
    setName(entry.name)
    setUrl(entry.url)
    setTransport(entry.transport)
    setHeaderKey(entry.headerKey ?? "")
    setHeaderValue("")
    setHeaderPlaceholder(entry.headerPlaceholder ?? "your API key")
    setAddTab("manual")
    toast.info(
      `Paste your ${entry.name} key in the visible field, then hit Add.`
    )
    requestAnimationFrame(() => document.getElementById("mcp-hv")?.focus())
  }

  const test = async (s: McpServerItem) => {
    setTesting(s.id)
    try {
      const res = await fetch(`/api/mcp/${s.id}/test`, { method: "POST" })
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        tools?: string[]
        error?: string
      }
      if (json.ok) {
        const list = json.tools ?? []
        toast.success(
          `${s.name}: ${list.length} tool${list.length === 1 ? "" : "s"}` +
            (list.length
              ? ` — ${list.slice(0, 6).join(", ")}${list.length > 6 ? "…" : ""}`
              : "")
        )
      } else {
        toast.error(`${s.name}: ${json.error ?? "connection failed"}`)
      }
    } finally {
      setTesting(null)
    }
  }

  // Both of these flip the UI first and put it back if the server disagrees.
  // Without the rollback the toggle would sit in a state the server never
  // accepted, looking correct until the next reload silently undid it.
  const toggle = async (s: McpServerItem, enabled: boolean) => {
    setItems((prev) => prev.map((x) => (x.id === s.id ? { ...x, enabled } : x)))
    const ok = await mutateOrToast(`/api/mcp/${s.id}`, {
      method: "PATCH",
      body: { enabled },
      errorMessage: `Couldn't ${enabled ? "enable" : "disable"} ${s.name}.`,
    })
    if (!ok)
      setItems((prev) =>
        prev.map((x) => (x.id === s.id ? { ...x, enabled: !enabled } : x))
      )
  }

  const remove = async (s: McpServerItem) => {
    const previous = items
    setItems((prev) => prev.filter((x) => x.id !== s.id))
    const ok = await mutateOrToast(`/api/mcp/${s.id}`, {
      method: "DELETE",
      errorMessage: `Couldn't remove ${s.name}.`,
    })
    if (!ok) setItems(previous)
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6">
      <div className="mb-1 flex items-center gap-2">
        <RiPlugLine className="size-5 text-primary-strong" />
        <h1 className="font-semibold text-xl">MCP Servers</h1>
      </div>
      <p className="mb-6 text-muted-foreground text-sm">
        Connect remote MCP tool servers (HTTP or SSE). The agent can list and
        call their tools in any chat.
      </p>

      <Tabs
        value={addTab}
        onValueChange={(value) => setAddTab(value as AddTab)}
        className="mb-8"
      >
        <TabsList>
          <TabsTrigger value="manual">Add manually</TabsTrigger>
          <TabsTrigger value="browse">Browse servers</TabsTrigger>
        </TabsList>

        {/* Manual: paste a name, URL, and (optional) auth header yourself. */}
        <TabsContent value="manual">
          <div className="rounded-xl border bg-card/40 p-4">
            <div className="grid gap-3">
              <div className="grid gap-1.5 sm:grid-cols-[1fr_2fr]">
                <div className="grid gap-1.5">
                  <Label htmlFor="mcp-name">Name</Label>
                  <Input
                    id="mcp-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="deepwiki"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="mcp-url">URL</Label>
                  <Input
                    id="mcp-url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://mcp.example.com/mcp"
                    className="font-mono text-sm"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid gap-1.5">
                  <Label>Transport</Label>
                  <div className="flex gap-1">
                    {(["http", "sse"] as Transport[]).map((t) => (
                      <Button
                        key={t}
                        type="button"
                        size="sm"
                        variant={transport === t ? "default" : "outline"}
                        className="h-9 w-20 uppercase"
                        onClick={() => setTransport(t)}
                      >
                        {t}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="grid flex-1 basis-52 gap-1.5">
                  {/* One visual label over the pair, but each input carries its
                      own name — the value field holds a credential and must
                      announce as more than an unlabeled textbox. */}
                  <span className="font-medium text-sm leading-none">
                    API key / header value (optional)
                  </span>
                  <div className="flex gap-1.5">
                    <Input
                      id="mcp-hk"
                      aria-label="Header name"
                      value={headerKey}
                      onChange={(e) => setHeaderKey(e.target.value)}
                      placeholder="Authorization"
                      className="font-mono text-xs"
                    />
                    <Input
                      id="mcp-hv"
                      type="password"
                      aria-label="Header value"
                      autoComplete="off"
                      value={headerValue}
                      onChange={(e) => setHeaderValue(e.target.value)}
                      placeholder={headerPlaceholder}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
                <Button
                  onClick={create}
                  disabled={creating || !name.trim() || !url.trim()}
                  className="gap-2"
                >
                  <RiAddLine className="size-4" /> Add
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Browse: curated public servers, added in one click. */}
        <TabsContent value="browse">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {MCP_CATALOG.map((entry) => {
              const added = inCatalogAlready(entry)
              return (
                <div
                  key={entry.slug}
                  className="flex items-start gap-3 rounded-xl border bg-card/40 p-3.5"
                >
                  <CatalogIcon icon={entry.icon} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium text-sm">
                        {entry.name}
                      </span>
                      <span className="rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {AUTH_LABEL[entry.authType]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-pretty text-muted-foreground text-xs">
                      {entry.description}
                    </p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant={added ? "ghost" : "outline"}
                        disabled={added || creating}
                        className="h-7 gap-1 text-xs"
                        onClick={() =>
                          entry.authType === "header"
                            ? prefillForHeader(entry)
                            : void addFromCatalog(entry)
                        }
                      >
                        {added ? (
                          <>
                            <RiCheckLine className="size-3.5" /> Added
                          </>
                        ) : (
                          <>
                            <RiAddLine className="size-3.5" /> Add
                          </>
                        )}
                      </Button>
                      <a
                        href={entry.learnMoreUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Docs <RiExternalLinkLine className="size-3" />
                      </a>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* List */}
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground text-sm">
          No MCP servers yet. Try adding{" "}
          <span className="font-mono">https://mcp.deepwiki.com/mcp</span>.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border bg-card/40 p-3.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-sm">{s.name}</span>
                  <span
                    className={cn(
                      "rounded-full border px-1.5 py-0.5 font-mono text-[10px] uppercase",
                      "text-muted-foreground"
                    )}
                  >
                    {s.transport}
                  </span>
                  {s.headerNames.length > 0 && (
                    <span
                      className="rounded-full border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                      title={s.headerNames.join(", ")}
                    >
                      {s.headerNames.join(", ")}
                    </span>
                  )}
                  {s.authorized && (
                    <span className="rounded-full border border-primary/40 px-1.5 py-0.5 font-medium text-[10px] text-primary-strong">
                      oauth ✓
                    </span>
                  )}
                  {s.hasOAuthClient && !s.authorized && (
                    <span className="rounded-full border px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground">
                      OAuth client saved
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate font-mono text-muted-foreground text-xs">
                  {s.url}
                </p>
              </div>
              {authAction(s) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5"
                  disabled={connecting === s.id}
                  onClick={() =>
                    authAction(s) === "disconnect" ? disconnect(s) : connect(s)
                  }
                  title={
                    s.authorized ? "Drop OAuth tokens" : "Authorize via OAuth"
                  }
                >
                  <RiKey2Line className="size-3.5" />
                  {connecting === s.id
                    ? "Starting…"
                    : s.authorized
                      ? "Disconnect"
                      : "Connect"}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                disabled={testing === s.id}
                onClick={() => test(s)}
              >
                <RiPulseLine className="size-3.5" />
                {testing === s.id ? "Testing…" : "Test"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                aria-expanded={configuringOAuth === s.id}
                onClick={() => toggleAdvanced(s)}
              >
                Advanced
              </Button>
              <Switch
                checked={s.enabled}
                onCheckedChange={(v) => toggle(s, v)}
                aria-label={`Enable ${s.name}`}
              />
              <ConfirmDialog
                title="Remove this MCP server?"
                description={`“${s.name}” and its saved authorization will be removed. This can't be undone.`}
                actionLabel="Remove"
                onConfirm={() => remove(s)}
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
              {configuringOAuth === s.id && (
                <div className="grid w-full gap-2 border-t pt-3 sm:grid-cols-[1fr_1fr_auto]">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`mcp-client-id-${s.id}`}>Client ID</Label>
                    <Input
                      id={`mcp-client-id-${s.id}`}
                      value={oauthClientId}
                      onChange={(event) => setOAuthClientId(event.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`mcp-client-secret-${s.id}`}>
                      Client secret (optional)
                    </Label>
                    <Input
                      id={`mcp-client-secret-${s.id}`}
                      type="password"
                      value={oauthClientSecret}
                      onChange={(event) =>
                        setOAuthClientSecret(event.target.value)
                      }
                      autoComplete="off"
                      placeholder={
                        s.hasOAuthClient
                          ? "Leave blank to keep saved secret"
                          : undefined
                      }
                    />
                  </div>
                  <Button
                    className="self-end"
                    disabled={!oauthClientId.trim()}
                    onClick={() => saveOAuthClient(s)}
                  >
                    Save
                  </Button>
                  <p className="text-muted-foreground text-xs sm:col-span-3">
                    Use this only when the authorization server does not support
                    dynamic client registration. MiniScira encrypts these values
                    before storing them.
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
