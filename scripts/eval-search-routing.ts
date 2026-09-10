import { readFile } from "node:fs/promises"
import { generateText, stepCountIs, type ToolSet, tool } from "ai"
import { z } from "zod"
import exa from "../agent/tools/exa_search"
import firecrawlMap from "../agent/tools/firecrawl_map"
import firecrawlScrape from "../agent/tools/firecrawl_scrape"
import firecrawlSearch from "../agent/tools/firecrawl_search"
import reddit from "../agent/tools/reddit_search"
import x from "../agent/tools/x_search"
import responses from "../evals/search-provider-responses.json"
import { searchRoutingFixtures } from "../evals/search-routing-fixtures"
import { chatModel } from "../lib/gateway"

const definitions = {
  firecrawl_search: firecrawlSearch,
  firecrawl_scrape: firecrawlScrape,
  firecrawl_map: firecrawlMap,
  reddit_search: reddit,
  exa_search: exa,
  x_search: x,
}

if (!process.env.AI_GATEWAY_BASE_URL || !process.env.AI_GATEWAY_API_KEY) {
  console.error(
    "Search routing evals require AI_GATEWAY_BASE_URL and AI_GATEWAY_API_KEY."
  )
  process.exit(1)
}

const modelId = process.env.EVAL_CHAT_MODEL ?? process.env.DEFAULT_CHAT_MODEL
if (!modelId) throw new Error("Set EVAL_CHAT_MODEL or DEFAULT_CHAT_MODEL.")
const model = chatModel(modelId)
const providerKeys = [
  "FIRECRAWL_API_KEY",
  "FIRECRAWL_API_URL",
  "EXA_API_KEY",
  "XAI_API_KEY",
] as const
const original = Object.fromEntries(
  providerKeys.map((key) => [key, process.env[key]])
)
let failures = 0
let total = 0
try {
  for (const fixture of searchRoutingFixtures) {
    if (process.env.EVAL_CASE && fixture.name !== process.env.EVAL_CASE)
      continue
    total++
    for (const key of providerKeys) delete process.env[key]
    if (fixture.providers === "all" || fixture.providers === "firecrawl")
      process.env.FIRECRAWL_API_KEY = "fixture"
    if (fixture.providers === "all" || fixture.providers === "exa")
      process.env.EXA_API_KEY = "fixture"
    if (fixture.providers === "all") process.env.XAI_API_KEY = "fixture"
    let system = await readFile(
      fixture.agent === "researcher"
        ? "agent/subagents/researcher/instructions/00-research.md"
        : "agent/instructions/00-core.md",
      "utf8"
    )
    if ("skill" in fixture)
      system += `\n${await readFile(`agent/skills/${fixture.skill}.md`, "utf8")}`
    const tools: ToolSet = {}
    if (fixture.agent === "root")
      tools.todo = tool({
        description: "Create or update the current task list.",
        inputSchema: z.object({
          todos: z
            .array(
              z.object({
                content: z.string(),
                priority: z.enum(["high", "medium", "low"]),
                status: z.enum([
                  "pending",
                  "in_progress",
                  "completed",
                  "cancelled",
                ]),
              })
            )
            .optional(),
        }),
        execute: async (input) => input,
      })
    for (const [name, definition] of Object.entries(definitions)) {
      const entry = await definition.events["step.started"]?.(
        {},
        {
          get session(): never {
            throw new Error("Provider availability must not read session state")
          },
          channel: {},
          messages: [],
        }
      )
      if (!entry) continue
      if (!(entry.inputSchema instanceof z.ZodType))
        throw new Error("Expected an authored Zod schema")
      tools[name] = tool({
        description: entry.description,
        inputSchema: entry.inputSchema,
        execute: async () => {
          const response =
            name === "reddit_search" || fixture.name === "reddit"
              ? responses.reddit
              : fixture.name === "exa-only"
                ? responses.paper
                : fixture.name === "comparison"
                  ? responses.comparison
                  : responses.postgres
          const first = response.results[0]
          return {
            ...response,
            url: first.url,
            title: first.title,
            markdown: response.results
              .map((result) => result.text)
              .join("\n\n"),
          }
        },
      })
    }
    try {
      const result = await generateText({
        model,
        system,
        prompt: `${fixture.prompt} Use at most one search request and one page read. Then give a brief answer with source URLs from the available evidence and disclose any limits.`,
        tools,
        stopWhen: stepCountIs(8),
        maxOutputTokens: 8000,
        abortSignal: AbortSignal.timeout(180_000),
        maxRetries: 0,
      })
      const calls = result.steps.flatMap((step) =>
        step.toolCalls.map((call) => call.toolName)
      )
      const searches = calls.filter((name) => name in definitions)
      const passed =
        fixture.expected === null
          ? searches.length === 0 &&
            /unavailable|unable|cannot|can.t|not available|not configured|no.*search/i.test(
              result.text
            )
          : searches[0] === fixture.expected && /https:\/\//.test(result.text)
      if (!passed) failures++
      console.log(
        JSON.stringify({
          fixture: fixture.name,
          model: modelId,
          available: Object.keys(tools),
          calls,
          passed,
          finishReason: result.finishReason,
          outputTokens: result.totalUsage.outputTokens,
          invalidCalls: result.steps.flatMap((step) =>
            step.toolCalls
              .filter((call) => call.invalid)
              .map((call) => ({ name: call.toolName, input: call.input }))
          ),
          answer: result.text,
        })
      )
    } catch {
      failures++
      console.log(
        JSON.stringify({
          fixture: fixture.name,
          model: modelId,
          passed: false,
          error: "Model routing evaluation request failed.",
        })
      )
    }
  }
} finally {
  for (const key of providerKeys) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
}
console.log(
  JSON.stringify({
    total,
    failures,
    fixtureScope:
      "Live model with authored instructions and runtime tool definitions; provider outputs are isolated fixtures, not deployed chat.",
  })
)
process.exitCode = failures ? 1 : 0
