"use client"

import {
  RiBookOpenLine,
  RiCheckLine,
  RiFileList3Line,
  RiListCheck2,
  RiPlugLine,
} from "@remixicon/react"
import { useState } from "react"

import { ChainOfThoughtStep } from "@/components/ai-elements/chain-of-thought"
import { TodoList, type TodoStatus } from "@/components/ai-elements/todo-list"
import { CodeBlock } from "@/components/timeline/nodes/execution"
import {
  arrayField,
  clampText,
  inputOf,
  isPartDone,
  outputOf,
  type ToolNodeProps,
} from "@/components/timeline/parts"
import { Live } from "@/components/timeline/primitives"
import { DotmHex3 } from "@/components/ui/dotm-hex-3"
import { useMountEffect } from "@/hooks/use-mount-effect"

/** The agent's housekeeping: plans, capabilities it reached for, and the tail. */

/* -------- todo checklist -------- */

type TodoItem = { content: string; status: string; priority?: string }

// eve's todo tool marks each item pending / in_progress / completed as it works;
// map that straight onto the AIcss to-do list's done / active / pending states.
function todoStatus(status: string): TodoStatus {
  if (status === "completed") return "done"
  if (status === "in_progress") return "active"
  return "pending"
}

export function TodoNode({ group, last, active }: ToolNodeProps) {
  const part = group.parts[0]
  const live = Boolean(active) && !isPartDone(part)
  const [open, setOpen] = useState(false)
  const items = (inputOf(part).todos as TodoItem[] | undefined) ?? []
  const done = items.filter((t) => t.status === "completed").length
  const label =
    items.length > 0
      ? `Plan · ${done}/${items.length} done`
      : "Planned the steps"

  return (
    <ChainOfThoughtStep
      last={last}
      icon={RiListCheck2}
      iconNode={live ? <Live /> : undefined}
      label={label}
      open={open}
      onOpenChange={setOpen}
      collapsible={items.length > 0}
    >
      {items.length > 0 && (
        <TodoList
          className="my-1"
          title="Plan"
          items={items.map((t) => ({
            label: t.content,
            status: todoStatus(t.status),
          }))}
        />
      )}
    </ChainOfThoughtStep>
  )
}

/* -------- connection_search -------- */

type ConnectionTool = {
  connection?: string
  tool?: string
  qualifiedName?: string
  description?: string
  needsAuthorization?: boolean
}

export function ConnectionNode({ group, last, active }: ToolNodeProps) {
  const part = group.parts[0]
  const live = Boolean(active) && !isPartDone(part)
  const [open, setOpen] = useState(false)
  const keywords = String(inputOf(part).keywords ?? "")
  const tools = arrayField<ConnectionTool>(outputOf(part), "results")

  return (
    <ChainOfThoughtStep
      last={last}
      icon={RiPlugLine}
      iconNode={live ? <Live /> : undefined}
      label={
        live
          ? "Searching connections"
          : `Found ${tools.length} connection tool${tools.length === 1 ? "" : "s"}`
      }
      open={open}
      onOpenChange={setOpen}
      collapsible={tools.length > 0}
      description={keywords ? `“${keywords}”` : undefined}
    >
      {tools.length > 0 && (
        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border bg-card/50">
          {tools.map((t) => (
            <div
              key={t.qualifiedName ?? `${t.connection}__${t.tool}`}
              className="px-3 py-2"
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="font-mono text-foreground text-xs">
                  {t.qualifiedName ?? `${t.connection}__${t.tool}`}
                </span>
                {t.needsAuthorization && (
                  <span className="rounded border px-1 text-[10px] text-muted-foreground">
                    auth
                  </span>
                )}
              </div>
              {t.description && (
                <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
                  {t.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </ChainOfThoughtStep>
  )
}

/* -------- MCP servers (mcp_list_tools / mcp_call) -------- */

export function McpNode({ group, last, active }: ToolNodeProps) {
  const part = group.parts[0]
  const live = Boolean(active) && !isPartDone(part)
  const [open, setOpen] = useState(false)
  const input = inputOf(part)
  const isCall = part.toolName === "mcp_call"
  const server = String(input.server ?? "")
  const tool = String(input.tool ?? "")

  const label = isCall
    ? `${live ? "Calling" : "Called"} ${server ? `${server} · ` : ""}${tool || "MCP tool"}`
    : live
      ? "Discovering MCP tools"
      : server
        ? `Listed ${server} tools`
        : "Listed MCP tools"

  const output = outputOf(part)

  return (
    <ChainOfThoughtStep
      last={last}
      icon={RiPlugLine}
      iconNode={live ? <Live /> : undefined}
      label={label}
      open={open}
      onOpenChange={setOpen}
    >
      {isCall && input.arguments != null && (
        <CodeBlock text={JSON.stringify(input.arguments, null, 2)} />
      )}
      {output != null && (
        <div>
          <div className="mb-1 font-medium text-[11px] text-muted-foreground">
            Result
          </div>
          <CodeBlock
            text={
              typeof output === "string"
                ? output
                : JSON.stringify(output, null, 2)
            }
          />
        </div>
      )}
    </ChainOfThoughtStep>
  )
}

/* -------- skill load -------- */

/**
 * Which playbook the agent pulled in (news_brief, deep_research, …). It reads as
 * a real research decision — it's what shapes everything after it — so it gets a
 * named row rather than SimpleNode's raw `load_skill`. The body is the skill's
 * own Markdown, collapsed by default since it's long and rarely needed.
 */
export function SkillNode({ group, last, active }: ToolNodeProps) {
  const part = group.parts[0]
  const live = Boolean(active) && !isPartDone(part)
  const [open, setOpen] = useState(false)
  const name = String(inputOf(part).skill ?? "")
  const output = outputOf(part)
  const body = typeof output === "string" ? output : ""

  return (
    <ChainOfThoughtStep
      last={last}
      icon={RiBookOpenLine}
      iconNode={live ? <Live /> : undefined}
      label={
        <span className="flex items-center gap-1.5">
          <span className="font-medium text-foreground">
            {live ? "Loading skill" : "Skill"}
          </span>
          {name && (
            <span className="truncate font-mono text-muted-foreground text-xs">
              {name}
            </span>
          )}
        </span>
      }
      open={open}
      onOpenChange={setOpen}
      collapsible={Boolean(body.trim())}
    >
      {body.trim() && (
        <div className="whitespace-pre-wrap text-muted-foreground text-xs leading-relaxed">
          {clampText(body)}
        </div>
      )}
    </ChainOfThoughtStep>
  )
}

export function SimpleNode({ group, last, active }: ToolNodeProps) {
  const part = group.parts[0]
  const live = Boolean(active) && !isPartDone(part)

  return (
    <ChainOfThoughtStep
      last={last}
      icon={RiFileList3Line}
      iconNode={live ? <Live /> : undefined}
      label={
        <span className="font-medium text-foreground">{part.toolName}</span>
      }
    />
  )
}

/* -------- terminal steps -------- */

export function DoneStep() {
  return (
    <ChainOfThoughtStep
      last
      iconNode={
        <span className="zoom-in-95 fade-in flex size-4 animate-in items-center justify-center rounded-full bg-primary text-primary-foreground">
          <RiCheckLine className="size-2.5" />
        </span>
      }
      label={<span className="font-medium text-muted-foreground">Done</span>}
    />
  )
}

const WORKING_MESSAGES = [
  "Digging through the sources",
  "Reading the fine print",
  "Connecting the dots",
  "Cross-checking the claims",
  "Following the trail",
  "Separating signal from noise",
  "Piecing it together",
  "Chasing down the details",
]

export function WorkingStep() {
  const [i, setI] = useState(0)
  useMountEffect(() => {
    const id = setInterval(
      () => setI((x) => (x + 1) % WORKING_MESSAGES.length),
      2600
    )
    return () => clearInterval(id)
  })
  return (
    <ChainOfThoughtStep
      last
      iconNode={
        <DotmHex3 size={16} dotSize={2} className="text-primary-strong" />
      }
      label={
        <span key={i} className="shimmer-text fade-in animate-in font-medium">
          {WORKING_MESSAGES[i]}…
        </span>
      }
    />
  )
}
