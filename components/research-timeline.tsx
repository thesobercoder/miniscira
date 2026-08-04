"use client"

import {
  RiArrowRightLine,
  RiCheckLine,
  RiErrorWarningLine,
} from "@remixicon/react"
import type { EveMessagePart } from "eve/react"
import { useState } from "react"
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought"
import { Markdown } from "@/components/markdown"
import {
  AuthorizationNode,
  CodeDiffNode,
  ConnectionNode,
  DetailNode,
  DocumentSearchNode,
  DoneStep,
  ImageNode,
  McpNode,
  QuestionNode,
  ReadNode,
  ReasoningNode,
  RunCodeNode,
  SearchNode,
  SimpleNode,
  SkillNode,
  TodoNode,
  WorkingStep,
} from "@/components/timeline/nodes"
import {
  type AnswerInput,
  arrayField,
  firstLine,
  type Group,
  groupError,
  groupParts,
  inputOf,
  isPartDone,
  outputOf,
  type SearchResult,
  summarize,
  type ToolKind,
  type ToolNodeProps,
} from "@/components/timeline/parts"
import { Live } from "@/components/timeline/primitives"
import { DelegateIcon } from "@/components/ui/delegate-icon"
import { DotmHex3 } from "@/components/ui/dotm-hex-3"
import { RobotIcon } from "@/components/ui/robot-icon"
import { hostOf } from "@/lib/urls"

// AnswerInput is re-exported because this module is the public entry point
// consumers already import it from.
export type { AnswerInput } from "@/components/timeline/parts"

/* -------- subagent -------- */

function SubagentResult({ output }: { output: unknown }) {
  if (output == null) return null

  // A declared subagent (e.g. researcher) returns its final brief as Markdown.
  // Render it so inline [text](url) citations are clickable and the formatting
  // shows, instead of dumping raw markdown into a <pre>. Structured outputs (an
  // object with sources/fields) keep the definition-list rendering below.
  if (typeof output === "string") {
    return (
      <div className="rounded-xl border bg-card/50 p-3 text-sm">
        <Markdown>{output}</Markdown>
      </div>
    )
  }

  const sources = arrayField<SearchResult>(output, "sources")
  const fields =
    output && typeof output === "object"
      ? Object.entries(output).filter(
          ([k, v]) =>
            k !== "sources" && (typeof v === "string" || typeof v === "number")
        )
      : []

  return (
    <div className="space-y-2 rounded-xl border bg-card/50 p-3 text-xs">
      {fields.length > 0 ? (
        <dl className="space-y-1.5">
          {fields.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="w-28 shrink-0 text-muted-foreground capitalize">
                {k.replace(/_/g, " ")}
              </dt>
              <dd className="min-w-0 flex-1 text-foreground">{String(v)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        !sources.length && (
          <pre className="overflow-x-auto whitespace-pre-wrap text-muted-foreground">
            {typeof output === "string"
              ? output
              : JSON.stringify(output, null, 2)}
          </pre>
        )
      )}
      {sources.length > 0 && (
        <div className="space-y-1 border-t pt-2">
          <div className="font-medium text-muted-foreground">Sources</div>
          {sources.map((s) => (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-1.5 truncate text-primary-strong hover:underline"
            >
              <RiArrowRightLine className="size-3 shrink-0 opacity-60" />
              <span className="truncate">{s.title || hostOf(s.url)}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function SubagentNode({ group, last, active, childParts }: ToolNodeProps) {
  const part = group.parts[0]
  const finished = isPartDone(part)
  const live = Boolean(active) && !finished
  // null = user hasn't chosen, which means collapsed.
  //
  // This used to auto-expand while the delegate was working, on the theory that
  // its progress should be visible. In practice a subagent emits a lot of steps
  // quickly, and an expanded nested timeline re-groups and reflows on every
  // delta — the parent transcript jumps around underneath whatever the reader
  // is trying to read. The step's own `description` already reports live
  // progress ("Working · 6 steps") in one line that changes without moving
  // anything, which is the part worth seeing by default. Opening it is a click.
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  const input = inputOf(part)
  const task = String(input.message ?? input.prompt ?? "")
  const name = part.toolMetadata?.eve?.name ?? "subagent"
  const label = firstLine(task) || `Subagent · ${name}`
  const output = outputOf(part)
  // The child session streams its own events wrapped in `subagent.event`,
  // keyed by this call's id — so the delegate's work can be shown as it happens
  // instead of a "Researching…" placeholder that hides everything until output.
  const nested = childParts?.[part.toolCallId]
  const nestedSteps = nested?.filter(
    (p) => p.type === "dynamic-tool" || p.type === "reasoning"
  )
  const hasNested = (nestedSteps?.length ?? 0) > 0
  const open = userOpen ?? false

  return (
    <ChainOfThoughtStep
      last={last}
      icon={DelegateIcon}
      iconNode={live ? <Live /> : undefined}
      label={label}
      open={open}
      onOpenChange={setUserOpen}
      description={
        live
          ? hasNested
            ? `Working · ${nestedSteps?.length} step${nestedSteps?.length === 1 ? "" : "s"}`
            : "Researching…"
          : finished
            ? `Delegated to ${name}`
            : "Stopped before finishing"
      }
    >
      {task && (
        <div className="whitespace-pre-wrap rounded-xl border bg-card/50 p-2.5 text-muted-foreground text-xs">
          {task}
        </div>
      )}
      {/* Gated on `open`, not just on having steps: the panel keeps its
          children mounted when closed, so without this the nested timeline
          would keep re-grouping and re-rendering on every streamed delta of a
          subagent nobody has expanded. */}
      {open && hasNested && nestedSteps && (
        // Recursion, but `nested` drops the inner "Research" header: the
        // subagent step is already the disclosure, and a second collapsed
        // header inside it buried the child's work behind two clicks.
        //
        // Laid out like a junction on a transit map: the parent step's rail
        // keeps running down the left as the main line, and the delegate's work
        // branches off it into its own line one level in.
        //
        // Geometry, in this wrapper's coordinates (its left edge is x=24 in the
        // parent step, since the step indents content by pl-6):
        //   -17  the parent step's rail. It is `left-2 -mx-px`, so it occupies
        //        x=7..8 in the step — hence -left-4 *plus* -ml-px here, or the
        //        elbow lands at x=8..9 and draws a second line 1px alongside it
        //     0  the left edge of the nested icons, which are 16 wide
        // The elbow therefore spans -16 → 0 and stops at the first icon's edge.
        // It deliberately does NOT continue to the icon's centre (x=8): these
        // glyphs are open outlines, so a line crossing them shows through the
        // middle. The nested steps' own rails take over from just below each
        // icon, which is why no continuous rail is drawn here — one would run
        // straight through every glyph.
        <div className="relative mt-1.5">
          <span
            aria-hidden="true"
            // Exactly `border-border` — the same token the rail fills with
            // (`w-px bg-border`). This branch and the line it joins are one
            // continuous rail, so they take one colour. Earlier attempts here
            // deliberately made it stronger to offset curve anti-aliasing; that
            // just traded a faint seam for an obvious one. If the curve ever
            // reads thin, fix it with geometry (radius, border width), never by
            // desynchronising the colour from the rail.
            className="pointer-events-none absolute -top-1.5 -left-4 -ml-px h-4 w-4 rounded-bl-[10px] border-border border-b border-l"
          />
          <ResearchTimeline parts={nestedSteps} active={live} nested />
        </div>
      )}
      {output != null && <SubagentResult output={output} />}
    </ChainOfThoughtStep>
  )
}

/**
 * Which component renders each kind of tool step. Adding a kind is one entry
 * here rather than another arm in a dispatcher; kinds with no entry (`other`)
 * fall through to SimpleNode.
 *
 * Keyed by `ToolKind`, not `Kind`: the two kinds whose parts aren't
 * `dynamic-tool` are dispatched explicitly in `node()` below, which is the one
 * place the group union gets narrowed. That narrowing is what lets every node
 * here read `group.parts` as `ToolPart[]` without asserting it.
 */
const NODE_BY_KIND: Partial<
  Record<ToolKind, React.ComponentType<ToolNodeProps>>
> = {
  skill: SkillNode,
  search: SearchNode,
  xsearch: SearchNode,
  reddit: SearchNode,
  map: SearchNode,
  read: ReadNode,
  subagent: SubagentNode,
  todo: TodoNode,
  connection: ConnectionNode,
  documents: DocumentSearchNode,
  bash: DetailNode,
  readfile: DetailNode,
  writefile: DetailNode,
  glob: DetailNode,
  grep: DetailNode,
  question: QuestionNode,
  mcp: McpNode,
  image: ImageNode,
  codediff: CodeDiffNode,
  runcode: RunCodeNode,
}

/* ----------------------------------- root --------------------------------- */

export function ResearchTimeline({
  parts,
  showDone = false,
  working = false,
  active = false,
  interrupted = false,
  onAnswer,
  busy,
  childParts,
  nested = false,
}: {
  parts: readonly EveMessagePart[]
  /** Child-session parts per subagent callId, from `subagent.event` wrappers. */
  childParts?: Record<string, readonly EveMessagePart[]>
  /** Render bare steps, without the collapsible "Research" chrome. Used when an
   *  enclosing step already provides the disclosure (subagent nesting). */
  nested?: boolean
  showDone?: boolean
  working?: boolean
  /** The turn is genuinely streaming — the only state allowed to show spinners. */
  active?: boolean
  /** The turn ended without an answer after this block — say so, honestly. */
  interrupted?: boolean
  onAnswer?: AnswerInput
  busy?: boolean
}) {
  // null = user hasn't chosen: expanded while streaming, collapsed once settled,
  // so a finished turn reads answer-first with the work log one click away.
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  const groups = groupParts(parts)
  if (groups.length === 0) return null

  const node = (group: Group, last: boolean, index: number) => {
    const chrome = { last, active, busy, childParts, onAnswer }
    // The single narrowing point for the whole timeline. Two kinds carry their
    // own part type; everything else is a tool group, so the table below can be
    // uniformly typed and no node has to assert what its parts are.
    const rendered =
      group.kind === "reasoning" ? (
        <ReasoningNode group={group} {...chrome} />
      ) : group.kind === "authorization" ? (
        <AuthorizationNode group={group} {...chrome} />
      ) : (
        (() => {
          const Node = NODE_BY_KIND[group.kind] ?? SimpleNode
          return <Node group={group} {...chrome} />
        })()
      )
    // Rendered once here rather than in each of the ~20 node components: every
    // kind can fail, and none of them showed it.
    const failure = groupError(group)
    return (
      // Steps arrive in bursts — a whole step's tool calls land together — so
      // they are staggered on entrance. The research then reads as progressing
      // rather than snapping into place all at once. Capped so a long
      // transcript's last nodes aren't left waiting on a growing delay.
      <div
        key={group.key}
        className="fade-in slide-in-from-bottom-1 animate-in duration-300 motion-reduce:animate-none"
        style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
      >
        {rendered}
        {failure && (
          // `relative` + its own rail segment: this row sits BELOW the step, and
          // the step's connector only spans its own height, so without this the
          // vertical line breaks wherever a step failed. `last` steps end the
          // rail on purpose, so they get no segment.
          <div className="relative pl-6">
            {!last && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-2 -mx-px w-px bg-border"
              />
            )}
            <p className="flex items-start gap-1.5 py-1 text-destructive/90 text-xs">
              <RiErrorWarningLine className="mt-px size-3.5 shrink-0" />
              <span className="wrap-anywhere min-w-0 flex-1">{failure}</span>
            </p>
          </div>
        )}
      </div>
    )
  }

  if (nested) {
    return (
      <div className="space-y-3">
        {groups.map((g, i) => node(g, i === groups.length - 1, i))}
      </div>
    )
  }

  // A pending question means the agent is waiting on the user, not finished.
  const pendingQuestion = groups.some(
    (g) => g.kind === "question" && !g.parts[0].toolMetadata?.eve?.inputResponse
  )
  const done = showDone && !pendingQuestion
  const showWorking = working && !done && !pendingQuestion
  const stopped = interrupted && !showWorking && !done && !pendingQuestion
  const hasTail = done || showWorking
  const state: "working" | "done" | "stopped" | "idle" = showWorking
    ? "working"
    : done
      ? "done"
      : stopped
        ? "stopped"
        : "idle"
  // A pending question must stay expanded so the user can answer it.
  const open = pendingQuestion ? true : (userOpen ?? state === "working")

  const headerIcon =
    state === "working" ? (
      <DotmHex3 size={14} dotSize={2} className="text-primary-strong" />
    ) : state === "done" ? (
      <span className="flex size-4 items-center justify-center rounded-full bg-primary/15 text-primary-strong">
        <RiCheckLine className="size-2.5" />
      </span>
    ) : (
      <RobotIcon className="size-4 text-muted-foreground" />
    )

  // Collapsed summary in plain language: what was searched, read, and matched.
  const { nQueries, nSources, docMatches } = summarize(groups)
  const summaryBits: string[] = []
  if (nQueries > 0)
    summaryBits.push(`${nQueries} search${nQueries === 1 ? "" : "es"}`)
  if (nSources > 0)
    summaryBits.push(`${nSources} source${nSources === 1 ? "" : "s"}`)
  if (docMatches > 0)
    summaryBits.push(`${docMatches} doc match${docMatches === 1 ? "" : "es"}`)
  const summary =
    state === "working"
      ? `${groups.length} step${groups.length === 1 ? "" : "s"}`
      : summaryBits.join(" · ") ||
        `${groups.length} step${groups.length === 1 ? "" : "s"}`

  return (
    <ChainOfThought
      open={open}
      onOpenChange={(v) => {
        if (!pendingQuestion) setUserOpen(v)
      }}
      className="space-y-0"
    >
      <ChainOfThoughtHeader
        className="font-medium text-foreground"
        icon={
          <span className="flex size-4 shrink-0 items-center justify-center">
            {headerIcon}
          </span>
        }
      >
        <span className="flex items-center gap-2">
          {state === "working"
            ? "Researching"
            : state === "stopped"
              ? "Research stopped"
              : "Research"}
          <span className="font-normal text-muted-foreground text-xs tabular-nums">
            {summary}
          </span>
        </span>
      </ChainOfThoughtHeader>

      <ChainOfThoughtContent className="mt-3 space-y-3">
        {groups.map((g, i) => node(g, i === groups.length - 1 && !hasTail, i))}
        {done && <DoneStep />}
        {showWorking && <WorkingStep />}
      </ChainOfThoughtContent>
    </ChainOfThought>
  )
}
