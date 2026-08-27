"use client"

import {
  RiAddLine,
  RiArrowUpLine,
  RiAttachmentLine,
  RiCameraLine,
  RiCheckLine,
  RiCloseLine,
  RiCompass3Line,
  RiErrorWarningLine,
  RiFileTextLine,
  RiGlobeLine,
  RiImageLine,
  RiPlugLine,
  RiRestartLine,
  RiSearchLine,
  RiStopFill,
} from "@remixicon/react"
import { BorderBeam } from "border-beam"
import Link from "next/link"
import { memo, useRef, useState } from "react"
import { ModelPickerDialog, ProviderIcon } from "@/components/model-picker"
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment"
import { Button } from "@/components/ui/button"
import { DotmHex3 } from "@/components/ui/dotm-hex-3"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { DOC_ACCEPT, type UploadedDoc } from "@/hooks/use-chat-attachments"
import { mutateOrToast } from "@/lib/api-client"
import { catalogIconForUrl } from "@/lib/mcp-catalog"
import { providerOf } from "@/lib/models"
import { faviconForServiceUrl } from "@/lib/urls"
import { cn } from "@/lib/utils"

export type Mode = "search" | "deep"

// Small dismissible pill for a non-default composer pick (mode / model).
function ComposerChip({
  icon,
  label,
  onClear,
}: {
  icon: React.ReactNode
  label: string
  onClear: () => void
}) {
  return (
    <span className="zoom-in-95 fade-in flex h-8 animate-in items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 py-0 pr-1 pl-2.5 font-medium text-primary-strong text-xs">
      {icon}
      <span className="max-w-32 truncate">{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove ${label}`}
        className="flex size-5 items-center justify-center rounded-full transition-colors hover:bg-primary/15"
      >
        <RiCloseLine className="size-3.5" />
      </button>
    </span>
  )
}

const MODES: Record<
  Mode,
  { label: string; icon: typeof RiSearchLine; hint: string }
> = {
  search: {
    label: "Search",
    icon: RiSearchLine,
    hint: "Fast, cited web answers",
  },
  deep: {
    label: "Deep",
    icon: RiCompass3Line,
    hint: "Thorough, multi-source report",
  },
}

type McpSource = {
  id: string
  name: string
  url: string
  enabled: boolean
  authorized: boolean
}

const MENU_SECTION =
  "text-muted-foreground px-2 pt-2 pb-1 text-[11px] font-medium"
const MENU_ROW =
  "hover:bg-muted flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors"

// The composer "+" menu: attach, research mode, and connected sources in one
// clean, organized popover (Perplexity-style). A Popover — not a dropdown — so
// source toggles don't dismiss it; actions close it explicitly.
function ComposerPlusMenu({
  mode,
  setMode,
  onAttach,
  onCamera,
}: {
  mode: Mode
  setMode: (m: Mode) => void
  onAttach: () => void
  onCamera: () => void
}) {
  const [open, setOpen] = useState(false)
  const [servers, setServers] = useState<McpSource[] | null>(null)

  // Opening the popover is a user action, so load the sources in the handler
  // rather than flipping `open` and letting an effect notice. Fetched once —
  // `servers` staying non-null is the cache.
  const openChange = (next: boolean) => {
    setOpen(next)
    if (!next || servers) return
    void fetch("/api/mcp", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { servers?: McpSource[] } | null) => {
        if (Array.isArray(d?.servers)) setServers(d.servers)
      })
      .catch(() => {})
  }

  const toggleSource = (s: McpSource, enabled: boolean) => {
    const flip = (value: boolean) =>
      setServers(
        (prev) =>
          prev?.map((x) => (x.id === s.id ? { ...x, enabled: value } : x)) ??
          null
      )
    flip(enabled)
    void mutateOrToast(`/api/mcp/${s.id}`, {
      method: "PATCH",
      body: { enabled },
      errorMessage: `Couldn't ${enabled ? "enable" : "disable"} ${s.name}.`,
    }).then((ok) => {
      if (!ok) flip(!enabled)
    })
  }

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Options"
            className="size-8 rounded-full transition-transform active:scale-[0.96]"
          />
        }
      >
        <RiAddLine className="size-4.5" />
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-64 gap-0 p-1">
        <button
          type="button"
          onClick={() => {
            onCamera()
            setOpen(false)
          }}
          className={MENU_ROW}
        >
          <RiCameraLine className="size-4 shrink-0 text-muted-foreground" />
          Take photo
          <span className="ml-auto text-[10px] text-muted-foreground">
            Photo
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            onAttach()
            setOpen(false)
          }}
          className={MENU_ROW}
        >
          <RiAttachmentLine className="size-4 shrink-0 text-muted-foreground" />
          Attach files
          <span className="ml-auto text-[10px] text-muted-foreground">
            Image · PDF · text
          </span>
        </button>

        <p className={MENU_SECTION}>Mode</p>
        {(Object.keys(MODES) as Mode[]).map((m) => {
          const Icon = MODES[m].icon
          return (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m)
                setOpen(false)
              }}
              className={MENU_ROW}
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex flex-1 flex-col">
                <span>{MODES[m].label}</span>
                <span className="text-[11px] text-muted-foreground">
                  {MODES[m].hint}
                </span>
              </span>
              {mode === m && (
                <RiCheckLine className="size-4 shrink-0 text-primary-strong" />
              )}
            </button>
          )
        })}

        <p className={MENU_SECTION}>Sources</p>
        {/* Web is the core source and can't be turned off. */}
        <div className={MENU_ROW.replace("hover:bg-muted", "")}>
          <RiGlobeLine className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex-1">Web</span>
          <span className="text-[11px] text-muted-foreground">Always on</span>
        </div>
        {servers?.map((s) => {
          // Prefer the crisp catalog brand mark; fall back to the main
          // domain's favicon (mcp.deepwiki.com → deepwiki.com).
          const icon = catalogIconForUrl(s.url) ?? faviconForServiceUrl(s.url)
          return (
            <div key={s.id} className={MENU_ROW.replace("hover:bg-muted", "")}>
              {icon ? (
                <span className="flex size-4 shrink-0 items-center justify-center rounded-[3px] bg-white ring-1 ring-border/60">
                  {/* biome-ignore lint/performance/noImgElement: tiny brand icon */}
                  <img src={icon} alt="" className="size-3 rounded-[2px]" />
                </span>
              ) : (
                <RiPlugLine className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <Switch
                size="sm"
                checked={s.enabled}
                onCheckedChange={(v) => toggleSource(s, v)}
                aria-label={`Use ${s.name}`}
              />
            </div>
          )
        })}
        <Link
          href="/mcps"
          className={cn(
            MENU_ROW,
            "text-muted-foreground hover:text-foreground"
          )}
        >
          <RiAddLine className="size-4 shrink-0" />
          Add sources
        </Link>
      </PopoverContent>
    </Popover>
  )
}

const DOC_STATUS: Record<
  UploadedDoc["status"],
  { state: "processing" | "error" | "done"; label: string }
> = {
  processing: { state: "processing", label: "Indexing…" },
  error: { state: "error", label: "Couldn't index" },
  ready: { state: "done", label: "Ready to search" },
}

function DocChip({
  doc,
  onRemove,
  onRetry,
}: {
  doc: UploadedDoc
  onRemove?: () => void
  onRetry?: () => void
}) {
  const { state, label } = DOC_STATUS[doc.status]
  const isImage = doc.kind === "image"
  // A failure says what went wrong; the icon alone left the user guessing.
  const description =
    doc.status === "error"
      ? (doc.error ?? label)
      : isImage
        ? doc.status === "processing"
          ? "Uploading…"
          : "Image"
        : label
  return (
    <Attachment
      size="sm"
      state={state}
      className={cn(
        "fade-in slide-in-from-bottom-1 relative min-w-44 animate-in overflow-hidden duration-200 motion-reduce:animate-none",
        // An indeterminate sweep while the bytes are in flight: the upload has
        // no progress events, but a still spinner made a slow PDF feel stalled.
        doc.status === "processing" &&
          "after:absolute after:inset-x-0 after:bottom-0 after:h-px after:animate-[shimmer-sweep_1.4s_linear_infinite] after:bg-[length:200%_100%] after:bg-[linear-gradient(90deg,transparent,var(--primary),transparent)] motion-reduce:after:animate-none"
      )}
    >
      {isImage && doc.url ? (
        <AttachmentMedia variant="image">
          {/* biome-ignore lint/performance/noImgElement: uploaded document image on Blob */}
          <img src={doc.url} alt={doc.filename} />
        </AttachmentMedia>
      ) : (
        <AttachmentMedia variant="icon">
          {doc.status === "processing" ? (
            <DotmHex3 size={16} dotSize={2} className="text-muted-foreground" />
          ) : doc.status === "error" ? (
            <RiErrorWarningLine />
          ) : isImage ? (
            <RiImageLine />
          ) : (
            <RiFileTextLine />
          )}
        </AttachmentMedia>
      )}
      <AttachmentContent>
        <AttachmentTitle title={doc.filename}>{doc.filename}</AttachmentTitle>
        <AttachmentDescription>{description}</AttachmentDescription>
      </AttachmentContent>
      {(onRemove || (onRetry && doc.status === "error")) && (
        <AttachmentActions>
          {onRetry && doc.status === "error" && (
            <AttachmentAction
              onClick={onRetry}
              aria-label={`Retry uploading ${doc.filename}`}
            >
              <RiRestartLine />
            </AttachmentAction>
          )}
          {onRemove && (
            <AttachmentAction
              onClick={onRemove}
              aria-label={`Remove ${doc.filename}`}
            >
              <RiCloseLine />
            </AttachmentAction>
          )}
        </AttachmentActions>
      )}
    </Attachment>
  )
}

type ComposerProps = {
  canceling: boolean
  chatModel: string
  chatModelName: string
  documents: readonly UploadedDoc[]
  input: string
  isBusy: boolean
  mode: Mode
  modelPickerOpen: boolean
  onInputChange: (value: string) => void
  onModeChange: (mode: Mode) => void
  onModelPickerOpenChange: (open: boolean) => void
  onPickModel: (id: string, name?: string) => void
  onRemoveDocument: (id: string) => void
  onRetryDocument: (id: string) => void
  onStop: () => void
  onSubmit: () => void
  onUpload: (files: FileList | File[]) => void
  /** Any staged file still uploading — sending now would drop it. */
  uploading: boolean
}

/**
 * The question box: staged attachments, the "+" menu, model pill, and
 * send/stop. Memoized because the transcript above it re-renders on every
 * streamed token and none of that touches the composer.
 */
export const Composer = memo(function Composer({
  canceling,
  chatModel,
  chatModelName,
  documents,
  input,
  isBusy,
  mode,
  modelPickerOpen,
  onInputChange,
  onModeChange,
  onModelPickerOpenChange,
  onPickModel,
  onRemoveDocument,
  onRetryDocument,
  onStop,
  onSubmit,
  onUpload,
  uploading,
}: ComposerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const dragDepthRef = useRef(0)
  const [dragActive, setDragActive] = useState(false)
  // Sending with an upload in flight would leave that file behind, so the
  // button waits for it rather than silently dropping the attachment.
  const canSend = input.trim().length > 0 && !uploading
  // Sending should collapse the phone software keyboard so the answer is
  // readable instead of hiding behind it. Coarse pointers only: on desktop a
  // blur would force a click before typing a follow-up.
  const dismissKeyboardOnSend = () => {
    if (!window.matchMedia("(pointer: coarse)").matches) return
    ;(document.activeElement as HTMLElement | null)?.blur()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (canSend) {
          dismissKeyboardOnSend()
          onSubmit()
        }
      }}
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return
        e.preventDefault()
        dragDepthRef.current += 1
        setDragActive(true)
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return
        e.preventDefault()
        e.dataTransfer.dropEffect = "copy"
      }}
      onDragLeave={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return
        e.preventDefault()
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
        if (dragDepthRef.current === 0) setDragActive(false)
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return
        e.preventDefault()
        dragDepthRef.current = 0
        setDragActive(false)
        if (e.dataTransfer.files.length > 0) onUpload(e.dataTransfer.files)
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={DOC_ACCEPT}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onUpload(e.target.files)
          e.target.value = ""
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onUpload(e.target.files)
          e.target.value = ""
        }}
      />
      {/* Beam runs while the agent researches; fades out when the turn settles.
          Sunset stops hue-rotated +86° land on the brand lime (primary oklch hue
          ~130); the tight hueRange keeps the shimmer within the green family. */}
      <BorderBeam
        active={isBusy}
        colorVariant="sunset"
        hueRange={10}
        strength={0.7}
        theme="dark"
        className="w-full"
        style={{ "--beam-hue-base": "86deg" } as React.CSSProperties}
      >
        {/* `bg-background`: the box is transparent by default, and the
            transcript scrolls right up under it — so the last line showed
            through the rounded corners, inside the border. The fade above only
            softens the text, it does not hide it. */}
        <InputGroup
          className={cn(
            "rounded-xl border-input bg-background",
            dragActive && "border-primary ring-3 ring-primary/20"
          )}
        >
          {dragActive && (
            <div className="pointer-events-none absolute inset-1 z-10 flex items-center justify-center rounded-lg border border-primary/35 bg-background/95 font-medium text-primary-strong text-sm backdrop-blur-sm">
              <RiAttachmentLine className="mr-2 size-4" />
              Drop files to attach
            </div>
          )}
          {documents.length > 0 && (
            <InputGroupAddon
              align="block-start"
              className="block px-2 pt-2 pb-0"
            >
              <AttachmentGroup className="py-0">
                {documents.map((d) => (
                  <DocChip
                    key={d.id}
                    doc={d}
                    onRemove={() => onRemoveDocument(d.id)}
                    onRetry={() => onRetryDocument(d.id)}
                  />
                ))}
              </AttachmentGroup>
            </InputGroupAddon>
          )}
          <InputGroupTextarea
            autoFocus
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files)
              if (files.length === 0) return
              e.preventDefault()
              onUpload(files)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                if (canSend && !isBusy) {
                  dismissKeyboardOnSend()
                  onSubmit()
                }
              }
            }}
            aria-label="Ask a research question"
            placeholder="Ask a research question…"
            // Deliberately NOT `disabled` while streaming: that drops focus
            // mid-turn and stops the reader drafting their next question. Enter
            // is gated above instead, so nothing can be submitted early.
            rows={1}
            // text-base below md: tailwind-merge strips the primitive's own
            // text-base, and anything under 16px makes iOS Safari zoom on focus.
            className="max-h-48 min-h-13 px-3.5 text-base leading-6 md:text-[15px]"
          />
          <InputGroupAddon align="block-end" className="gap-1.5 px-2 pb-2">
            {/* The "+" menu: attach, research mode, and connected sources in one. */}
            <ComposerPlusMenu
              mode={mode}
              setMode={onModeChange}
              onAttach={() => fileInputRef.current?.click()}
              onCamera={() => cameraInputRef.current?.click()}
            />

            <ModelPickerDialog
              open={modelPickerOpen}
              onOpenChange={onModelPickerOpenChange}
              value={chatModel}
              onPick={onPickModel}
            />

            {/* Deep mode surfaces as a dismissible chip; the model lives in its
              own pill by the send button, so it's always visible there. */}
            {mode === "deep" && (
              <ComposerChip
                icon={<RiCompass3Line className="size-3.5 shrink-0" />}
                label="Deep Research"
                onClear={() => onModeChange("search")}
              />
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onModelPickerOpenChange(true)}
              aria-label="Choose model"
              className="ml-auto h-8 gap-1.5 rounded-full px-2.5 font-medium text-xs"
            >
              <ProviderIcon
                provider={providerOf(chatModel)}
                className="size-3.5 shrink-0"
              />
              <span className="max-w-40 truncate">{chatModelName}</span>
            </Button>

            {/* One button that changes role, not two that swap places: the
                icons cross-fade so send → stop reads as a state change rather
                than a control disappearing under the cursor. */}
            <InputGroupButton
              type={isBusy ? "button" : "submit"}
              size="icon-sm"
              variant="default"
              aria-label={
                isBusy
                  ? canceling
                    ? "Stopping…"
                    : "Stop generating"
                  : uploading
                    ? "Waiting for upload to finish"
                    : "Send"
              }
              // Deliberately not disabled on an empty box or a pending upload:
              // a greyed-out control reads as "this app is broken" at rest. The
              // action is guarded in `onSubmit` instead, so the button stays
              // live and simply does nothing until there's something to send.
              disabled={canceling}
              onClick={isBusy ? onStop : undefined}
              className={cn(
                "relative rounded-lg transition-[transform,opacity] active:scale-[0.96]",
                canceling && "opacity-60"
              )}
            >
              <RiArrowUpLine
                className={cn(
                  "absolute size-4.5 transition-[opacity,scale] duration-200 ease-out-strong motion-reduce:transition-none",
                  isBusy ? "scale-50 opacity-0" : "scale-100 opacity-100"
                )}
              />
              <RiStopFill
                className={cn(
                  "absolute transition-[opacity,scale] duration-200 ease-out-strong motion-reduce:transition-none",
                  isBusy ? "scale-100 opacity-100" : "scale-50 opacity-0"
                )}
              />
              {/* A ring that keeps turning while the cancel is in flight —
                  "working on stopping", where a pulse just read as disabled. */}
              {canceling && (
                <span
                  aria-hidden
                  className="absolute inset-0.5 animate-spin rounded-full border-2 border-current border-r-transparent opacity-70 motion-reduce:animate-none"
                />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </BorderBeam>
    </form>
  )
})
