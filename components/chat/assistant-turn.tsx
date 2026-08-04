"use client"

import {
  RiCheckLine,
  RiFileCopyLine,
  RiGitBranchLine,
  RiRestartLine,
} from "@remixicon/react"
import type { EveMessage, EveMessagePart } from "eve/client"
import { memo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  ArtifactChip,
  type PanelArtifact,
} from "@/components/ai-elements/artifact"
import { Markdown } from "@/components/markdown"
import { ProviderIcon } from "@/components/model-picker"
import {
  type AnswerInput,
  ResearchTimeline,
} from "@/components/research-timeline"
import { TurnStatusNote, TurnUsage } from "@/components/turn-status"
import { Button } from "@/components/ui/button"
import { DotmHex3 } from "@/components/ui/dotm-hex-3"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Message, MessageContent } from "@/components/ui/message"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useMountEffect } from "@/hooks/use-mount-effect"
import { partText } from "@/lib/chat-events"
import { CHAT_MODELS, providerOf } from "@/lib/models"
import {
  EMPTY_ANNOTATION,
  SESSION_SCOPE,
  type TurnAnnotation,
  type TurnAnnotations,
} from "@/lib/turn-annotations"
import { cn } from "@/lib/utils"

/**
 * Resolves the annotation for a rendered message via its `turnId`.
 *
 * `session.failed` carries no turnId, so a session-level failure is folded into
 * the last assistant turn — that's where the reader is looking when the
 * conversation dies, and it would otherwise render nowhere at all.
 */
export function annotationForMessage(
  annotations: TurnAnnotations,
  message: EveMessage,
  isLast: boolean
): TurnAnnotation | undefined {
  const own = message.metadata?.turnId
    ? annotations[message.metadata.turnId]
    : undefined
  const sessionFailure = isLast
    ? annotations[SESSION_SCOPE]?.failure
    : undefined
  if (!sessionFailure) return own
  return {
    ...(own ?? EMPTY_ANNOTATION),
    failure: own?.failure ?? sessionFailure,
  }
}

type ArtifactData = { title: string; language: string; content: string }
type Block =
  | { kind: "timeline"; parts: EveMessagePart[] }
  | { kind: "text"; text: string }
  | { kind: "artifact"; id: string; artifact: ArtifactData }

// A stable id for an artifact across renders: its message + tool-call.
function artifactId(messageId: string, toolCallId: string) {
  return `${messageId}:${toolCallId}`
}

// Pull the artifact fields from a tool part — from its output once available,
// else from the streaming input so the card can appear as it's being written.
function artifactOf(part: EveMessagePart): ArtifactData | null {
  if (part.type !== "dynamic-tool" || part.toolName !== "artifact") return null
  const src = ((part.state === "output-available" ? part.output : part.input) ??
    part.input ??
    {}) as Partial<ArtifactData>
  if (typeof src.content !== "string" || !src.content) return null
  return {
    title: typeof src.title === "string" && src.title ? src.title : "Artifact",
    language:
      typeof src.language === "string" && src.language
        ? src.language.toLowerCase()
        : "text",
    content: src.content,
  }
}

// Every artifact in the conversation, in order — feeds the browsable panel.
export function collectArtifacts(
  messages: readonly EveMessage[]
): PanelArtifact[] {
  const out: PanelArtifact[] = []
  for (const m of messages) {
    if (m.role !== "assistant") continue
    for (const p of m.parts) {
      const a = artifactOf(p)
      if (a && p.type === "dynamic-tool")
        out.push({ id: artifactId(m.id, p.toolCallId), ...a })
    }
  }
  return out
}

/**
 * Split an assistant message into ordered blocks: timeline runs (reasoning +
 * tool calls, in stream order) and prose. `step-start` boundaries are ignored
 * so step-separated nodes stay on one continuous rail. A single "Done" shows on
 * the last timeline block once the turn finishes; the last prose block animates
 * while the answer is still streaming.
 */
function renderBody(
  message: EveMessage,
  {
    complete,
    busy,
    onAnswer,
    onOpenArtifact,
    activeArtifactId,
    childParts,
  }: {
    complete: boolean
    busy: boolean
    onAnswer: AnswerInput
    onOpenArtifact: (id: string) => void
    activeArtifactId: string | null
    childParts?: Record<string, readonly EveMessagePart[]>
  }
) {
  const blocks: Block[] = []
  let run: EveMessagePart[] = []
  const flush = () => {
    if (run.length > 0) {
      blocks.push({ kind: "timeline", parts: run })
      run = []
    }
  }

  for (const part of message.parts) {
    if (part.type === "step-start") continue // don't break the rail between steps
    // Artifacts are deliverables, not research steps — lift them out of the
    // collapsible timeline so they render as prominent cards in stream order.
    const artifact = artifactOf(part)
    if (artifact && part.type === "dynamic-tool") {
      flush()
      blocks.push({
        kind: "artifact",
        id: artifactId(message.id, part.toolCallId),
        artifact,
      })
      continue
    }
    if (
      part.type === "dynamic-tool" ||
      (part.type === "reasoning" && part.text.trim())
    ) {
      run.push(part)
      continue
    }
    if (part.type === "text" && part.text.trim()) {
      flush()
      blocks.push({ kind: "text", text: part.text })
    }
  }
  flush()

  const hasCalls = message.parts.some(
    (p) => p.type === "dynamic-tool" && !artifactOf(p)
  )
  let lastTimelineIdx = -1
  let lastTextIdx = -1
  // An artifact is a delivered result too, so it counts as "answered".
  let lastResultIdx = -1
  blocks.forEach((b, i) => {
    if (b.kind === "timeline") lastTimelineIdx = i
    else {
      lastResultIdx = i
      if (b.kind === "text") lastTextIdx = i
    }
  })
  // "Done" caps the research only once an answer (a text block) actually follows
  // the final timeline block — never when the turn merely planned and stopped.
  const answered = lastResultIdx > lastTimelineIdx
  // While the turn is still streaming and the last thing happening is research
  // (not prose), show the animated "working" indicator at the rail's end.
  const working = !complete && blocks.at(-1)?.kind === "timeline"

  const nodes = blocks.map((b, i) =>
    b.kind === "timeline" ? (
      <ResearchTimeline
        // biome-ignore lint/suspicious/noArrayIndexKey: append-only block list; position is the identity
        key={i}
        parts={b.parts}
        showDone={complete && answered && hasCalls && i === lastTimelineIdx}
        working={working && i === lastTimelineIdx}
        active={!complete}
        interrupted={complete && !answered && i === lastTimelineIdx}
        onAnswer={onAnswer}
        busy={busy}
        childParts={childParts}
      />
    ) : b.kind === "artifact" ? (
      <ArtifactChip
        // biome-ignore lint/suspicious/noArrayIndexKey: append-only block list; position is the identity
        key={i}
        artifact={{ id: b.id, ...b.artifact }}
        active={b.id === activeArtifactId}
        onOpen={() => onOpenArtifact(b.id)}
      />
    ) : (
      <div
        // biome-ignore lint/suspicious/noArrayIndexKey: append-only block list; position is the identity
        key={i}
        className="fade-in animate-in"
      >
        <Markdown animating={!complete && i === lastTextIdx}>{b.text}</Markdown>
      </div>
    )
  )

  return { nodes, answered, hasCalls, hasText: lastTextIdx >= 0 }
}

// Icon-only, outlined, no labels: the row sits under every answer, so the words
// were repeated down the whole transcript for affordances people learn once.
const ACTION_BUTTON =
  "text-muted-foreground border-border/70 hover:text-foreground hover:bg-accent"

function IconAction({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className={ACTION_BUTTON}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

// Quiet afterlife for a completed answer: copy it, re-run it (optionally on a
// different model), or branch the conversation from here into a new chat.
function AnswerActions({
  message,
  onRetry,
  onBranch,
  busy,
}: {
  message: EveMessage
  onRetry?: (modelId?: string) => void
  onBranch?: () => void
  busy?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [branching, setBranching] = useState(false)
  // Held so the reset can be cancelled: a turn can be unmounted (retry, branch,
  // supersede) well inside the 1.5s window.
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useMountEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current)
  })

  const copy = () => {
    void navigator.clipboard
      .writeText(partText(message.parts, "text"))
      .then(() => {
        setCopied(true)
        if (copyTimer.current) clearTimeout(copyTimer.current)
        copyTimer.current = setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => toast.error("Couldn't copy that"))
  }

  const branch = async () => {
    setBranching(true)
    try {
      await onBranch?.()
    } finally {
      setBranching(false)
    }
  }

  return (
    <div className="flex items-center gap-1">
      <IconAction label={copied ? "Copied" : "Copy"} onClick={copy}>
        {/* Cross-fade the icon swap instead of hard-toggling it. */}
        <span className="relative size-3.5 shrink-0">
          <RiFileCopyLine
            className={cn(
              "absolute inset-0 size-3.5 transition-[opacity,scale,filter] duration-200 ease-out-strong",
              copied
                ? "scale-95 opacity-0 blur-[4px]"
                : "scale-100 opacity-100 blur-none"
            )}
          />
          <RiCheckLine
            className={cn(
              "absolute inset-0 size-3.5 text-primary-strong transition-[opacity,scale,filter] duration-200 ease-out-strong",
              copied
                ? "scale-100 opacity-100 blur-none"
                : "scale-95 opacity-0 blur-[4px]"
            )}
          />
        </span>
      </IconAction>
      {onRetry && (
        <DropdownMenu>
          <Tooltip>
            {/* Nested render props: the tooltip renders the menu trigger,
                which in turn renders the button. Base UI's documented way of
                composing two triggers onto one element. */}
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label="Retry"
                      disabled={busy}
                      className={ACTION_BUTTON}
                    />
                  }
                />
              }
            >
              <RiRestartLine className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>Retry</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem onSelect={() => onRetry()}>
              <RiRestartLine className="size-4 text-muted-foreground" /> Same
              model
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {CHAT_MODELS.map((m) => (
              <DropdownMenuItem key={m.id} onSelect={() => onRetry(m.id)}>
                <ProviderIcon
                  provider={providerOf(m.id)}
                  className="size-4 shrink-0"
                />
                {m.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {onBranch && (
        <IconAction
          label={branching ? "Branching…" : "Branch"}
          disabled={busy || branching}
          onClick={() => void branch()}
        >
          <RiGitBranchLine
            className={cn("size-3.5", branching && "animate-pulse")}
          />
        </IconAction>
      )}
    </div>
  )
}

export function ThinkingRow() {
  return (
    <div className="flex items-center gap-2.5 text-muted-foreground text-sm">
      <DotmHex3 size={22} dotSize={3} className="text-primary-strong" />
      <span>Thinking…</span>
    </div>
  )
}

type AssistantTurnProps = {
  message: EveMessage
  streaming: boolean
  onAnswer: AnswerInput
  busy: boolean
  onRetry?: (modelId?: string) => void
  onBranch?: () => void
  onOpenArtifact: (id: string) => void
  activeArtifactId: string | null
  /** Lifecycle facts the eve reducer drops (failure, cancellation, compaction). */
  annotation?: TurnAnnotation
  /** Child-session parts per subagent callId, for the nested timeline. */
  childParts?: Record<string, readonly EveMessagePart[]>
}

// A settled turn's content never changes, but the parent re-renders on every
// token of a *later* streaming turn. Skip those re-renders so completed answers
// don't thrash (and, with the static-markdown fix, don't re-run their fade-in).
// The streaming turn's message ref changes each token, so it still updates.
// Every prop compared here must be identity-stable across unrelated updates:
// a prop rebuilt per render (as `childParts` once was, conversation-wide and
// refreshed ~8x/second while any subagent streams) silently defeats the memo.
// `childParts` is now the per-turn subset from `selectChildParts` in
// components/research-chat.tsx, which guarantees that stability.
function turnPropsEqual(prev: AssistantTurnProps, next: AssistantTurnProps) {
  return (
    prev.message === next.message &&
    prev.streaming === next.streaming &&
    prev.busy === next.busy &&
    prev.activeArtifactId === next.activeArtifactId &&
    // Annotations arrive after the message settles (a failure lands with
    // turn.failed), so a settled turn must still re-render when they change.
    prev.annotation === next.annotation &&
    prev.childParts === next.childParts &&
    Boolean(prev.onRetry) === Boolean(next.onRetry) &&
    Boolean(prev.onBranch) === Boolean(next.onBranch)
  )
}

export const AssistantTurn = memo(function AssistantTurn({
  message,
  streaming,
  onAnswer,
  busy,
  onRetry,
  onBranch,
  onOpenArtifact,
  activeArtifactId,
  annotation,
  childParts,
}: AssistantTurnProps) {
  const { nodes, hasText } = renderBody(message, {
    complete: !streaming,
    busy,
    onAnswer,
    onOpenArtifact,
    activeArtifactId,
    childParts,
  })
  const nothingYet = nodes.length === 0
  // The turn is over but no answer ever landed. Only fall back to the generic
  // line when the annotations can't say something specific — a failure,
  // cancellation, or length cut-off all explain this better.
  const explained = Boolean(
    annotation?.failure || annotation?.cancelled || annotation?.stopReason
  )
  const stopped = !streaming && !hasText && nodes.length > 0 && !explained

  return (
    <Message align="start">
      <MessageContent className="gap-4 pt-1">
        {nodes}
        {streaming && nothingYet && <ThinkingRow />}
        <TurnStatusNote
          annotation={annotation}
          streaming={streaming}
          onRetry={onRetry}
          busy={busy}
        />
        {/* Compaction is worth showing even mid-stream — it explains a sudden
            pause and any loss of earlier detail while the turn continues. */}
        {streaming && (annotation?.compactions ?? 0) > 0 && (
          <p className="fade-in animate-in text-muted-foreground text-xs">
            Trimming context to fit the model's window…
          </p>
        )}
        {stopped && (
          <div className="fade-in flex animate-in items-center gap-2 text-muted-foreground text-sm">
            <span>Stopped before finishing.</span>
            {onRetry && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRetry()}
                disabled={busy}
                className="h-7 gap-1.5 px-2 text-muted-foreground text-xs hover:text-foreground"
              >
                <RiRestartLine className="size-3.5" /> Retry
              </Button>
            )}
          </div>
        )}
        {!streaming && hasText && (
          <div className="flex items-center gap-2">
            <AnswerActions
              message={message}
              onRetry={onRetry}
              onBranch={onBranch}
              busy={busy}
            />
            <TurnUsage annotation={annotation} />
          </div>
        )}
      </MessageContent>
    </Message>
  )
}, turnPropsEqual)
