"use client"

import {
  RiArrowDownSLine,
  RiArrowRightCircleLine,
  RiCheckboxCircleFill,
  RiCheckboxCircleLine,
} from "@remixicon/react"
import { useState } from "react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

// AIcss To-do List (aicss.dev/components/task-list), translated from its
// CSS-module demo into our Tailwind idiom: a Cursor-style plan the agent keeps
// up to date, with done / in-progress / pending item states, a collapsible
// header, and a count. Data-driven — pass real items in.
export type TodoStatus = "done" | "active" | "pending"

export type TodoItem = {
  label: string
  status: TodoStatus
}

// A dashed ring for pending items, drawn to match the AIcss look.
function DashedCircle({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-4", className)}
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeDasharray="1.8 3.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function TodoIcon({ status }: { status: TodoStatus }) {
  if (status === "done")
    return <RiCheckboxCircleFill className="size-4 text-primary-strong" />
  if (status === "active")
    return <RiArrowRightCircleLine className="size-4 text-foreground" />
  return <DashedCircle className="text-muted-foreground/50" />
}

export function TodoList({
  items,
  title = "To-dos",
  defaultOpen = true,
  className,
}: {
  items: TodoItem[]
  title?: string
  defaultOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const total = items.length
  const done = items.filter((i) => i.status === "done").length
  const running = items.some((i) => i.status === "active")
  const allDone = total > 0 && done === total

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "my-3 overflow-hidden rounded-xl border border-border bg-card",
        className
      )}
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/40">
        {allDone ? (
          <RiCheckboxCircleFill className="size-4 shrink-0 text-primary-strong" />
        ) : (
          <RiCheckboxCircleLine
            className={cn(
              "size-4 shrink-0 text-muted-foreground",
              running && "text-foreground"
            )}
          />
        )}
        <span className="font-medium text-foreground text-sm">{title}</span>
        <span className="ml-auto font-mono text-muted-foreground text-xs tabular-nums">
          {done}/{total}
        </span>
        <RiArrowDownSLine
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            !open && "-rotate-90"
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <ul className="border-border/60 border-t px-2 py-1.5">
          {items.map((item) => (
            <li
              key={item.label}
              className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5"
            >
              <span className="shrink-0">
                <TodoIcon status={item.status} />
              </span>
              <span
                className={cn(
                  "text-sm transition-colors",
                  item.status === "done" &&
                    "text-muted-foreground line-through",
                  item.status === "active" && "font-medium text-foreground",
                  item.status === "pending" && "text-muted-foreground"
                )}
              >
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
