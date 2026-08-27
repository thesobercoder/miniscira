"use client"

import {
  RiAlertLine,
  RiArchiveLine,
  RiErrorWarningLine,
  RiRestartLine,
  RiScissorsCutLine,
  RiStopCircleLine,
  RiWifiOffLine,
} from "@remixicon/react"

import { Button } from "@/components/ui/button"
import type { TurnAnnotation } from "@/lib/turn-annotations"
import { cn } from "@/lib/utils"

// Everything the eve reducer drops on the floor, rendered so a turn can account
// for itself: why it failed, why it stopped early, and what happened to the
// context along the way.

function Note({
  icon: Icon,
  tone = "muted",
  children,
  action,
  live,
}: {
  icon: typeof RiAlertLine
  tone?: "muted" | "danger"
  children: React.ReactNode
  action?: React.ReactNode
  /** Announce this note when it appears — used for outcomes, not commentary. */
  live?: boolean
}) {
  return (
    <div
      // A failure is the one thing in a turn a reader must not miss, so it is
      // announced rather than left to be discovered by scrolling.
      role={live ? "alert" : undefined}
      className={cn(
        // Slide as well as fade: a note that appears after the answer has
        // settled needs to pull the eye back up to itself.
        "fade-in slide-in-from-top-1 flex animate-in items-start gap-2 rounded-xl border px-3 py-2 text-xs duration-200 motion-reduce:animate-none",
        tone === "danger"
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-border/60 bg-card/40 text-muted-foreground"
      )}
    >
      <Icon className="mt-px size-3.5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">{children}</div>
      {action}
    </div>
  )
}

const STOP_COPY: Record<string, { title: string; detail: string }> = {
  length: {
    title: "Cut off at the model's output limit",
    detail:
      "The answer stopped mid-way because the response hit its maximum length, not because the research finished.",
  },
  "content-filter": {
    title: "Stopped by a content filter",
    detail: "The provider blocked part of the response.",
  },
  error: {
    title: "The model stopped on an error",
    detail: "The provider ended the step early.",
  },
}

export function TurnStatusNote({
  annotation,
  streaming,
  onRetry,
  busy,
  hasAttachments,
}: {
  annotation?: TurnAnnotation
  streaming: boolean
  onRetry?: (modelId?: string) => void
  busy?: boolean
  hasAttachments?: boolean
}) {
  if (!annotation || streaming) return null

  const {
    failure,
    stepFailures,
    cancelled,
    compactions,
    compactedAtTokens,
    stopReason,
  } = annotation

  const retry = onRetry ? (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => onRetry()}
      disabled={busy}
      className="-my-1 h-7 shrink-0 gap-1.5 px-2 text-xs"
    >
      <RiRestartLine className="size-3.5" /> Retry
    </Button>
  ) : undefined
  const photoFailure =
    hasAttachments &&
    failure &&
    (failure.code.includes("1210") ||
      failure.message.includes("图片") ||
      failure.message.includes("not valid for encoding"))

  return (
    <div className="space-y-2">
      {/* A terminal failure is the whole story — the reducer renders nothing for
          it, so without this the turn just stops with no explanation at all. */}
      {failure && (
        <Note icon={RiErrorWarningLine} tone="danger" action={retry} live>
          <p className="font-medium">This turn failed</p>
          <p className="text-destructive/80">
            {photoFailure
              ? "Your model couldn't process your photo this time. Try sending again."
              : failure.message}
          </p>
          <p className="font-mono text-[10px] text-destructive/60">
            {failure.code} {photoFailure ? failure.message : null}
          </p>
        </Note>
      )}

      {/* Cancellation is not failure: the turn ended cleanly, just early. */}
      {cancelled && !failure && (
        <Note icon={RiStopCircleLine} action={retry}>
          <p>You stopped this turn.</p>
        </Note>
      )}

      {stopReason && !failure && !cancelled && (
        <Note
          icon={RiAlertLine}
          action={stopReason === "length" ? retry : undefined}
          live
        >
          {/* An unrecognised stopReason still gets a sentence. Reading the map
              directly rendered an empty bordered box with just an icon. */}
          <p className="font-medium text-foreground">
            {STOP_COPY[stopReason]?.title ?? "The answer ended early"}
          </p>
          <p>
            {STOP_COPY[stopReason]?.detail ??
              `The model stopped for an unexpected reason (${stopReason}).`}
          </p>
        </Note>
      )}

      {/* Non-fatal: the agent hit an error mid-step and carried on. Worth
          showing because it explains a slow or oddly-shaped turn. */}
      {stepFailures.length > 0 && !failure && (
        <Note icon={RiArchiveLine}>
          <p>
            Recovered from {stepFailures.length} failed step
            {stepFailures.length === 1 ? "" : "s"}.
          </p>
          <p className="truncate font-mono text-[10px] opacity-70">
            {stepFailures.at(-1)?.message}
          </p>
        </Note>
      )}

      {/* Explains why the agent may not recall earlier detail in this thread. */}
      {compactions > 0 && (
        <Note icon={RiScissorsCutLine}>
          <p>
            Context trimmed
            {compactions > 1 ? ` ${compactions} times` : ""} during this turn
            {compactedAtTokens
              ? ` at ~${fmt.format(compactedAtTokens)} input tokens`
              : ""}{" "}
            — earlier messages were summarized to fit the model's window.
          </p>
        </Note>
      )}
    </div>
  )
}

/**
 * The browser stopped receiving a turn that is still running on the server.
 * Distinct from a failure and from a finished answer — the work continues, so
 * the offer is to re-attach rather than to retry.
 */
export function DetachedNote({ onReattach }: { onReattach: () => void }) {
  return (
    <Note
      icon={RiWifiOffLine}
      live
      action={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReattach}
          className="-my-1 h-7 shrink-0 gap-1.5 px-2 text-xs"
        >
          <RiRestartLine className="size-3.5" /> Reconnect
        </Button>
      }
    >
      <p className="font-medium text-foreground">Lost the connection</p>
      <p>
        This turn is still running. Reconnect to pick it back up where it got
        to.
      </p>
    </Note>
  )
}

const fmt = new Intl.NumberFormat("en-US", { notation: "compact" })

/** Quiet per-turn cost/token readout, shown beside the answer actions. */
export function TurnUsage({ annotation }: { annotation?: TurnAnnotation }) {
  if (!annotation) return null
  const { inputTokens, outputTokens, costUsd } = annotation.usage
  const tokens = inputTokens + outputTokens
  if (tokens === 0 && costUsd === 0) return null

  return (
    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">
      {tokens > 0 && `${fmt.format(tokens)} tokens`}
      {tokens > 0 && costUsd > 0 && " · "}
      {costUsd > 0 &&
        `$${costUsd < 0.01 ? costUsd.toFixed(4) : costUsd.toFixed(2)}`}
    </span>
  )
}
