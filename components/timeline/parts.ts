import type { EveMessagePart } from "eve/client"

/**
 * The timeline's data model: how eve's message parts are classified into step
 * kinds, grouped into nodes, and read for their inputs and results.
 *
 * Pure logic only, no JSX — the node components and the timeline root both
 * import from here, which is what keeps them from importing each other.
 */

export type AnswerInput = (
  requestId: string,
  response: { optionId?: string; text?: string }
) => void

export type ToolPart = Extract<EveMessagePart, { type: "dynamic-tool" }>
export type ReasoningPart = Extract<EveMessagePart, { type: "reasoning" }>
export type AuthPart = Extract<EveMessagePart, { type: "authorization" }>
export type TimelinePart = ToolPart | ReasoningPart | AuthPart
export type SearchResult = { url: string; title?: string }
export type DocResult = { filename: string; content: string; score?: number }

export type Kind =
  | "reasoning"
  | "authorization"
  | "search"
  | "xsearch"
  | "reddit"
  | "read"
  | "skill"
  | "todo"
  | "subagent"
  | "question"
  | "bash"
  | "readfile"
  | "writefile"
  | "glob"
  | "grep"
  | "connection"
  | "documents"
  | "mcp"
  | "map"
  | "image"
  | "codediff"
  | "runcode"
  | "other"

/**
 * Every kind whose parts are `dynamic-tool`, i.e. all of them but the two the
 * reducer projects into their own part types.
 */
export type ToolKind = Exclude<Kind, "reasoning" | "authorization">

function kindOfPart(part: ToolPart): ToolKind {
  const eve = part.toolMetadata?.eve
  if (eve?.inputRequest) return "question" // ask_question / approval
  if (eve?.kind === "subagent-call" || part.toolName === "agent")
    return "subagent"
  if (eve?.kind === "load-skill" || part.toolName === "load_skill")
    return "skill"
  switch (part.toolName) {
    case "web_search":
    case "exa_search":
    case "firecrawl_search":
      return "search"
    case "x_search":
      return "xsearch"
    case "reddit_search":
      return "reddit"
    case "web_fetch":
    case "firecrawl_scrape":
      return "read"
    case "firecrawl_map":
      return "map"
    case "todo":
      return "todo"
    case "run_code":
      return "runcode"
    case "generate_image":
      return "image"
    // The model's built-in file-edit tool, surfaced by the eve harness under
    // provider-native names (Anthropic text editor / OpenAI apply_patch).
    case "str_replace_based_edit_tool":
    case "str_replace_editor":
    case "text_editor":
    case "apply_patch":
      return "codediff"
    case "bash":
      return "bash"
    case "read_file":
      return "readfile"
    case "write_file":
      return "writefile"
    case "glob":
      return "glob"
    case "grep":
      return "grep"
    case "connection_search":
      return "connection"
    case "search_documents":
      return "documents"
    case "mcp_list_tools":
    case "mcp_call":
      return "mcp"
    default:
      return "other"
  }
}

export function basename(path: string) {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path
}

export function clampText(text: string, max = 2000) {
  return text.length > max ? `${text.slice(0, max)}\n… (truncated)` : text
}

export function isPartDone(part: TimelinePart) {
  if (part.type === "reasoning") return part.state === "done"
  // `output-denied` is terminal too — the user declined the call and nothing
  // more will arrive. Leaving it out kept declined steps spinning forever.
  return (
    part.state === "output-available" ||
    part.state === "output-error" ||
    part.state === "output-denied"
  )
}

/**
 * Why a step ended badly, or undefined when it didn't.
 *
 * A failed tool call used to render as a finished step with no results, which
 * reads identically to "searched and found nothing" — the timeline claimed work
 * had happened that never did.
 */
export function errorOf(part: TimelinePart): string | undefined {
  if (part.type !== "dynamic-tool") return undefined
  if (part.state === "output-error")
    return part.errorText?.trim() || "This step failed."
  if (part.state === "output-denied")
    return part.approval?.reason?.trim() || "You declined this step."
  return undefined
}

/** The first failure in a group, so one node can account for its whole run. */
export function groupError(group: Group): string | undefined {
  for (const part of group.parts) {
    const message = errorOf(part)
    if (message) return message
  }
  return undefined
}

export function inputOf(part: ToolPart) {
  return (part.input ?? {}) as Record<string, unknown>
}

/** A tool part's output, but only once it has actually arrived. */
export function outputOf(part: ToolPart): unknown {
  return part.state === "output-available" ? part.output : undefined
}

/**
 * Reads an array-valued field off an unknown tool output. The element type is
 * the caller's claim about its own tool, stated once in its return type.
 */
export function arrayField<T>(output: unknown, field: string): T[] {
  if (!output || typeof output !== "object") return []
  const value = Reflect.get(output, field)
  return Array.isArray(value) ? value : []
}

function resultsOf(part: ToolPart): SearchResult[] {
  return arrayField(outputOf(part), "results")
}

export function docResultsOf(part: ToolPart): DocResult[] {
  return arrayField(outputOf(part), "results")
}

export function firstLine(text: string) {
  const line =
    text
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? ""
  return line.length > 90 ? `${line.slice(0, 90)}…` : line
}

export function queriesOf(part: ToolPart): string[] {
  const input = inputOf(part)
  // Built-in web_search takes { objective, search_queries: [...] }; the X/Reddit
  // tools take { queries: [...] }; others take { query }.
  if (Array.isArray(input.search_queries))
    return input.search_queries.map(String)
  if (Array.isArray(input.queries)) return input.queries.map(String)
  if (input.query) return [String(input.query)]
  // firecrawl_map: show the mapped url (and the filter term when present)
  if (input.url)
    return [String(input.url), ...(input.search ? [String(input.search)] : [])]
  return []
}

export function urlsOf(part: ToolPart): string[] {
  const input = inputOf(part)
  if (Array.isArray(input.urls)) return input.urls.map(String)
  if (input.url) return [String(input.url)]
  return []
}

const SEARCH_KINDS = new Set<Kind>(["search", "xsearch", "reddit", "map"])

/** Unique web sources (with titles when known) cited across a turn's parts. */
export function collectSources(
  parts: readonly EveMessagePart[]
): SearchResult[] {
  const seen = new Set<string>()
  const out: SearchResult[] = []
  for (const p of parts) {
    if (p.type !== "dynamic-tool") continue
    for (const r of resultsOf(p)) {
      if (r.url && !seen.has(r.url)) {
        seen.add(r.url)
        out.push(r)
      }
    }
  }
  return out
}

/**
 * A group's `kind` determines what its parts are — that correlation is real,
 * and it used to be re-asserted by hand at fifteen call sites as
 * `group.parts[0] as ToolPart`. Those casts were unchecked in both directions:
 * they claimed a part type nothing enforced, and on an empty `parts` they
 * claimed `undefined` was a part, so a node would crash on property access with
 * no type error anywhere.
 *
 * Encoding it as a union moves the guarantee to the one place that can actually
 * establish it — `groupParts`, below — and every consumer narrows on `kind` for
 * free.
 */
/**
 * Non-empty by construction: `groupParts` only ever opens a group *with* its
 * first part. Spelling that as a tuple is what makes `parts[0]` safe to read
 * without a cast or a guard — the old `parts[0] as ToolPart` was willing to
 * hand a node `undefined` and call it a part.
 */
type NonEmpty<T> = [T, ...T[]]

export type ReasoningGroup = {
  kind: "reasoning"
  parts: NonEmpty<ReasoningPart>
  key: string
}
export type AuthGroup = {
  kind: "authorization"
  parts: NonEmpty<AuthPart>
  key: string
}
export type ToolGroup = {
  kind: ToolKind
  parts: NonEmpty<ToolPart>
  key: string
}

export type Group = ReasoningGroup | AuthGroup | ToolGroup

/** Narrow a group to the tool arm. `kind` is the discriminant. */
function isToolGroup(group: Group): group is ToolGroup {
  return group.kind !== "reasoning" && group.kind !== "authorization"
}

export function groupParts(parts: readonly EveMessagePart[]): Group[] {
  const groups: Group[] = []
  // Index of the part that last extended the open reasoning run. Merging on
  // "the previous *group* was reasoning" is not enough: the part types this
  // function skips (`text`, `step-start`, and anything non-tool) leave no group
  // behind, so a whole turn's thinking would collapse into the first node with
  // the searches between them rendered after it. A run continues only across
  // genuinely adjacent parts of the same agent step.
  let reasoningRunEnd = -1
  parts.forEach((p, i) => {
    if (p.type === "reasoning") {
      const last = groups.at(-1)
      const open = last?.kind === "reasoning" ? last : undefined
      const continues =
        open !== undefined &&
        reasoningRunEnd === i - 1 &&
        open.parts.at(-1)?.stepIndex === p.stepIndex
      // Merge consecutive reasoning deltas within one step into one node.
      if (continues) open.parts.push(p)
      else groups.push({ kind: "reasoning", parts: [p], key: `reasoning-${i}` })
      reasoningRunEnd = i
      return
    }
    // The reducer projects `authorization.required` into its own part type.
    // Without a branch here it would render as nothing, leaving a connection
    // waiting on sign-in with no visible prompt anywhere in the transcript.
    if (p.type === "authorization") {
      groups.push({
        kind: "authorization",
        parts: [p],
        key: `authorization-${i}-${p.name}`,
      })
      return
    }
    if (p.type !== "dynamic-tool") return
    const kind = kindOfPart(p)
    const last = groups.at(-1)
    // Merge consecutive same-kind searches / reads into one section; everything
    // else (subagents, questions, skills, todos) stays a discrete node.
    const mergeable =
      (kind === "search" || kind === "read") &&
      last !== undefined &&
      last.kind === kind
        ? last
        : undefined
    if (mergeable) {
      mergeable.parts.push(p)
    } else {
      groups.push({ kind, parts: [p], key: `${kind}-${i}-${p.toolCallId}` })
    }
  })
  return groups
}

/** Plain-language counts for the collapsed summary line. */
export function summarize(groups: Group[]) {
  const queries = new Set<string>()
  const sources = new Set<string>()
  let docMatches = 0
  for (const g of groups) {
    if (!isToolGroup(g)) continue
    if (SEARCH_KINDS.has(g.kind)) {
      for (const p of g.parts) {
        for (const q of queriesOf(p)) queries.add(q)
        for (const r of resultsOf(p)) if (r.url) sources.add(r.url)
      }
    }
    if (g.kind === "read")
      for (const p of g.parts) for (const u of urlsOf(p)) sources.add(u)
    if (g.kind === "documents")
      for (const p of g.parts) docMatches += docResultsOf(p).length
  }
  return { nQueries: queries.size, nSources: sources.size, docMatches }
}

/**
 * What every timeline node takes besides its group. `last`/`active` are what
 * almost all of them read; the last three are needed by exactly one node each
 * (subagent, question) and ignored by the rest — keeping them on the shared
 * shape is what lets the kind → component table be a plain lookup.
 */
export type NodeChrome = {
  last?: boolean
  active?: boolean
  childParts?: Record<string, readonly EveMessagePart[]>
  onAnswer?: AnswerInput
  busy?: boolean
}

/**
 * A node parameterised by the group arm it renders. The table in
 * research-timeline.tsx is keyed by `ToolKind` and holds only `ToolNodeProps`
 * components, so a tool node receives `ToolPart[]` without asserting anything;
 * the two non-tool kinds are dispatched explicitly beside it.
 */
export type NodeProps<G extends Group = Group> = NodeChrome & { group: G }
export type ToolNodeProps = NodeProps<ToolGroup>
