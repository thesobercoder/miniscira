"use client"

import {
  RiAlertLine,
  RiCheckLine,
  RiCornerDownRightLine,
  RiExternalLinkLine,
  RiQuestionLine,
  RiSendPlaneFill,
  RiShieldKeyholeLine,
} from "@remixicon/react"
import type { EveMessageInputRequest } from "eve/react"
import { useState } from "react"

import { ChainOfThoughtStep } from "@/components/ai-elements/chain-of-thought"
import type {
  AuthGroup,
  NodeProps,
  ToolNodeProps,
} from "@/components/timeline/parts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/** Steps that are waiting on the reader: sign-in prompts and HITL questions. */

/* -------- authorization (connection sign-in) -------- */

export function AuthorizationNode({ group, last }: NodeProps<AuthGroup>) {
  const part = group.parts[0]
  const pending = part.state === "required"
  const challenge = part.authorization
  const title = part.displayName || part.name

  return (
    <ChainOfThoughtStep
      last={last}
      icon={RiShieldKeyholeLine}
      label={pending ? `Connect ${title}` : `${title} connected`}
      status={pending ? "active" : "complete"}
      description={
        pending
          ? part.description
          : part.state === "completed"
            ? // `outcome` explains a denial or expiry, not just success.
              `Authorization ${part.outcome}${part.reason ? ` · ${part.reason}` : ""}`
            : undefined
      }
      collapsible={pending && Boolean(challenge?.url || challenge?.userCode)}
    >
      {pending && challenge && (
        <div className="space-y-2 rounded-xl border bg-card/50 p-3">
          {challenge.instructions && (
            <p className="text-muted-foreground text-xs">
              {challenge.instructions}
            </p>
          )}
          {challenge.userCode && (
            <p className="text-xs">
              Code:{" "}
              <span className="font-mono text-foreground tracking-wider">
                {challenge.userCode}
              </span>
            </p>
          )}
          {challenge.url && (
            <Button
              nativeButton={false}
              render={
                <a
                  href={challenge.url}
                  target="_blank"
                  rel="noreferrer noopener"
                />
              }
              size="sm"
              className="h-7 gap-1.5 text-xs"
            >
              Authorize <RiExternalLinkLine className="size-3.5" />
            </Button>
          )}
          {challenge.expiresAt && (
            <p className="text-[11px] text-muted-foreground">
              Expires {new Date(challenge.expiresAt).toLocaleTimeString()}
            </p>
          )}
        </div>
      )}
    </ChainOfThoughtStep>
  )
}

/* -------- question / approval (HITL) -------- */

function FreeformAnswer({
  onSubmit,
  disabled,
}: {
  onSubmit: (text: string) => void
  disabled?: boolean
}) {
  const [text, setText] = useState("")
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim()) onSubmit(text.trim())
      }}
      className="flex items-center gap-1.5"
    >
      <RiCornerDownRightLine className="size-4 shrink-0 text-muted-foreground" />
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type an answer…"
        disabled={disabled}
        className="h-8 text-sm"
      />
      <Button
        type="submit"
        size="icon"
        variant="outline"
        className="size-8 shrink-0"
        disabled={disabled || !text.trim()}
      >
        <RiSendPlaneFill className="size-4" />
        <span className="sr-only">Send answer</span>
      </Button>
    </form>
  )
}

const REQUEST_STYLE: Record<
  EveMessageInputRequest["kind"],
  { icon: typeof RiQuestionLine; label: string; frame: string }
> = {
  question: {
    icon: RiQuestionLine,
    label: "Question for you",
    frame: "border-primary/30 bg-primary/5",
  },
  "tool-approval": {
    icon: RiShieldKeyholeLine,
    label: "Approval needed",
    frame: "border-amber-500/30 bg-amber-500/5",
  },
  "session-limit": {
    icon: RiAlertLine,
    label: "Token budget reached",
    frame: "border-amber-500/40 bg-amber-500/10",
  },
}

export function QuestionNode({ group, last, onAnswer, busy }: ToolNodeProps) {
  const part = group.parts[0]
  const request = part.toolMetadata?.eve?.inputRequest
  const responded = part.toolMetadata?.eve?.inputResponse
  const [chosen, setChosen] = useState<string | null>(null)

  if (!request) return null
  const hasOptions = !!request.options && request.options.length > 0
  const answeredLabel =
    chosen ??
    (responded
      ? (request.options?.find((o) => o.id === responded.optionId)?.label ??
        responded.text ??
        responded.optionId ??
        "Answered")
      : null)

  const pick = (
    response: { optionId?: string; text?: string },
    label: string
  ) => {
    setChosen(label)
    onAnswer?.(request.requestId, response)
  }

  // eve 0.28 added `kind` so clients stop inferring intent from the tool name.
  // The three read very differently: a research question is the agent asking for
  // direction, an approval is it asking permission, and a session limit is a
  // spend decision the user should not mistake for either.
  const style = REQUEST_STYLE[request.kind] ?? REQUEST_STYLE.question

  return (
    <ChainOfThoughtStep
      last={last}
      icon={style.icon}
      label={<span className="font-medium text-foreground">{style.label}</span>}
    >
      <div className={cn("rounded-xl border p-3", style.frame)}>
        <p className="text-pretty font-medium text-foreground text-sm">
          {request.prompt}
        </p>
        {answeredLabel ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-muted-foreground text-xs">
            <RiCheckLine className="size-3.5 text-primary-strong" />{" "}
            {answeredLabel}
          </p>
        ) : (
          <div className="mt-2.5 flex flex-col gap-2">
            {hasOptions && (
              <div className="flex flex-wrap gap-1.5">
                {request.options?.map((o) => (
                  <Button
                    key={o.id}
                    size="sm"
                    variant={
                      o.style === "danger"
                        ? "destructive"
                        : o.style === "primary"
                          ? "default"
                          : "outline"
                    }
                    disabled={busy}
                    onClick={() => pick({ optionId: o.id }, o.label)}
                    className="h-8 transition-transform active:scale-[0.96]"
                  >
                    {o.label}
                  </Button>
                ))}
              </div>
            )}
            {/* Open questions (no options) are answered by free text. */}
            {(request.allowFreeform || !hasOptions) && (
              <FreeformAnswer
                disabled={busy}
                onSubmit={(text) => pick({ text }, text)}
              />
            )}
          </div>
        )}
      </div>
    </ChainOfThoughtStep>
  )
}
