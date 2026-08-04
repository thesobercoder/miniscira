"use client"

import {
  RiCheckLine,
  RiCpuLine,
  RiEyeLine,
  RiFileTextLine,
  RiRestartLine,
} from "@remixicon/react"
// biome-ignore lint/style/noRestrictedImports: prop-driven catalog fetch — see the effect below
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  formatContext,
  PROVIDERS,
  providerLabel,
  providerOf,
} from "@/lib/models"
import { cn } from "@/lib/utils"

type ApiModel = {
  id: string
  name: string
  provider: string
  context: number
  vision: boolean
  fileInput: boolean
}

export function ProviderIcon({
  provider,
  className,
}: {
  provider: string
  className?: string
}) {
  const meta = PROVIDERS[provider]
  if (!meta?.icon) return <RiCpuLine className={className} />
  if (!meta.iconDark) {
    // biome-ignore lint/performance/noImgElement: tiny external brand svg
    return <img src={meta.icon} alt="" loading="lazy" className={className} />
  }
  // Monochrome marks: swap variants by theme with CSS so SSR stays consistent.
  // Eager-load both — a lazy display:none img never fetches, so the first
  // theme flip would show a blank slot while the other variant loads.
  return (
    <>
      {/* biome-ignore lint/performance/noImgElement: tiny external brand svg */}
      <img src={meta.icon} alt="" className={cn(className, "dark:hidden")} />
      {/* biome-ignore lint/performance/noImgElement: tiny external brand svg */}
      <img
        src={meta.iconDark}
        alt=""
        className={cn(className, "hidden dark:block")}
      />
    </>
  )
}

/**
 * Searchable model picker over the live AI Gateway catalog (tool-capable
 * language models). A provider rail on the left narrows the list on the
 * right to one provider at a time; typing a search term widens back out
 * to every provider so search never feels scoped to the wrong rail item.
 */
export function ModelPickerDialog({
  open,
  onOpenChange,
  value,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string
  onPick: (id: string, name: string) => void
}) {
  const [models, setModels] = useState<ApiModel[] | null>(null)
  const [search, setSearch] = useState("")
  const [providerOverride, setProviderOverride] = useState<string | null>(null)
  // Swallowing the failure left the dialog on "Loading models…" forever, with
  // no way to ask again short of closing and reopening the whole chat.
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  // `open` is a prop the parent flips directly (research-chat sets it from a
  // button), so this can't move into onOpenChange — that handler only fires for
  // dismissals. The alternative, unmounting the dialog when closed, would drop
  // its exit animation. So this stays an effect on purpose.
  useEffect(() => {
    if (!open || models) return
    let active = true
    setFailed(false)
    // no-store: the server caches the catalog in memory (1h TTL); letting the
    // browser cache too can serve stale capability data after deploys.
    fetch("/api/models", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { models?: ApiModel[] } | null) => {
        if (!active) return
        if (Array.isArray(d?.models)) setModels(d.models)
        else setFailed(true)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [open, models, reloadKey])

  // Group by provider, preserving the server's order (featured first). The
  // source array is already contiguous per provider, so groups are unique.
  const groups: { provider: string; models: ApiModel[] }[] = []
  for (const m of models ?? []) {
    const last = groups.at(-1)
    if (last && last.provider === m.provider) last.models.push(m)
    else groups.push({ provider: m.provider, models: [m] })
  }

  const valueProvider = providerOf(value)
  const activeProvider =
    providerOverride ??
    groups.find((g) => g.provider === valueProvider)?.provider ??
    groups[0]?.provider

  const searching = search.trim().length > 0
  const visibleGroups = searching
    ? groups
    : groups.filter((g) => g.provider === activeProvider)

  function handleOpenChange(o: boolean) {
    onOpenChange(o)
    if (!o) {
      setSearch("")
      setProviderOverride(null)
    }
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Pick a model"
      description="Tool-capable models from the AI Gateway"
      // Override CommandDialog's upper-third anchor — a full model picker reads
      // better centered on the page than floating high like a command palette.
      className="top-1/2 -translate-y-1/2 sm:max-w-2xl"
    >
      <Command shouldFilter={searching}>
        <CommandInput
          value={search}
          onValueChange={setSearch}
          placeholder="Search 190+ models…"
        />
        {/* Height is capped, not fixed: at 26rem tall the dialog overflowed a
            short viewport (and 200% zoom) in both directions, and a modal's
            overflow isn't page-scrollable, so the top of the list was
            unreachable. The rail also narrows before it squeezes the list. */}
        <div className="flex h-[min(26rem,60dvh)]">
          {/* Provider rail: wide enough for full names, no truncation. Shares the
              dialog background — only a divider separates it from the list. */}
          <div className="scrollbar-none flex w-32 shrink-0 flex-col gap-0.5 overflow-y-auto border-r p-1.5 sm:w-48">
            {!searching && (
              <div className="px-2 pt-1 pb-1.5 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                Providers
              </div>
            )}
            {groups.map((g) => (
              <button
                key={g.provider}
                type="button"
                onClick={() => setProviderOverride(g.provider)}
                data-active={!searching && g.provider === activeProvider}
                className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-muted-foreground text-sm transition-colors hover:bg-accent/50 data-[active=true]:bg-accent data-[active=true]:font-medium data-[active=true]:text-accent-foreground"
              >
                <ProviderIcon
                  provider={g.provider}
                  className="size-4 shrink-0"
                />
                <span className="min-w-0 flex-1 truncate">
                  {providerLabel(g.provider)}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                  {g.models.length}
                </span>
              </button>
            ))}
          </div>
          <CommandList className="max-h-none flex-1 p-1.5">
            <CommandEmpty className="py-10 text-center text-sm">
              {failed ? (
                <span className="flex flex-col items-center gap-3">
                  <span className="text-muted-foreground">
                    Couldn&apos;t load the model list.
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setReloadKey((k) => k + 1)}
                    className="gap-1.5 transition-transform active:scale-[0.96]"
                  >
                    <RiRestartLine className="size-3.5" /> Try again
                  </Button>
                </span>
              ) : models ? (
                "No models match."
              ) : (
                "Loading models…"
              )}
            </CommandEmpty>
            {visibleGroups.map((g) => (
              <CommandGroup
                key={g.provider}
                heading={searching ? providerLabel(g.provider) : undefined}
              >
                {g.models.map((m) => {
                  const selected = value === m.id
                  return (
                    <CommandItem
                      key={m.id}
                      value={`${providerLabel(g.provider)} ${m.name} ${m.id}`}
                      onSelect={() => {
                        onPick(m.id, m.name)
                        handleOpenChange(false)
                      }}
                      className="gap-2.5 rounded-lg py-2"
                    >
                      <ProviderIcon
                        provider={m.provider}
                        className="size-5 shrink-0"
                      />
                      {/* Name gets its own line; provider · context sits beneath,
                          so a long name never fights the capability badges. */}
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm leading-tight">
                          {m.name}
                        </span>
                        <span className="truncate text-muted-foreground text-xs leading-tight">
                          {providerLabel(m.provider)}
                          {m.context > 0 &&
                            ` · ${formatContext(m.context)} context`}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {/* `title` on a span never surfaces on touch and
                            announces inconsistently — name the icon instead. */}
                        {m.vision && (
                          <RiEyeLine
                            role="img"
                            aria-label="Understands images"
                            className="size-3.5 text-muted-foreground"
                          />
                        )}
                        {m.fileInput && (
                          <RiFileTextLine
                            role="img"
                            aria-label="Reads attached PDFs and files"
                            className="size-3.5 text-muted-foreground"
                          />
                        )}
                        {selected && (
                          <RiCheckLine className="size-4 text-primary-strong" />
                        )}
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </div>
      </Command>
    </CommandDialog>
  )
}
