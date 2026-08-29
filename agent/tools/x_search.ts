import { APICallError } from "@ai-sdk/provider"
import { xai } from "@ai-sdk/xai"
import { generateText, stepCountIs } from "ai"
import { defineTool } from "eve/tools"
import { getTweet } from "react-tweet/api"
import { z } from "zod"

type CitationSource = { sourceType?: string; url?: string }
type Tweet = { text: string; url: string; handle: string | null; id: string }
type SearchFailure = "authorization" | "provider"
type QueryOutcome =
  | { kind: "success"; tweets: Tweet[] }
  | { kind: "failure"; failure: SearchFailure }

export type XSearchDependencies = {
  generateText: (options: Parameters<typeof generateText>[0]) => Promise<{
    sources?: unknown
  }>
  getTweet: (id: string) => Promise<{
    text?: string | null
    user?: { screen_name?: string | null } | null
  } | null | undefined>
}

const AUTHORIZATION_ERROR =
  "X search is unavailable because the configured xAI account cannot authorize requests or has reached its usage limit."
const PROVIDER_ERROR = "X search is temporarily unavailable."

function failureOf(error: unknown): SearchFailure {
  return APICallError.isInstance(error) &&
    (error.statusCode === 401 || error.statusCode === 403)
    ? "authorization"
    : "provider"
}

function errorFor(failures: SearchFailure[]): string | undefined {
  if (failures.includes("authorization")) return AUTHORIZATION_ERROR
  if (failures.length > 0) return PROVIDER_ERROR
  return undefined
}

export function createXSearchTool(
  dependencies: XSearchDependencies = {
    generateText: (options) => generateText(options),
    getTweet,
  }
) {
  return defineTool({
    description:
      "Search X (formerly Twitter) posts using the X API with multiple queries, covering the past 15 days by default unless a date range is given. If the user gives a link to a post, put it as the first query.",
    inputSchema: z
      .object({
        queries: z
          .array(z.string())
          .min(1)
          .max(5)
          .describe(
            "Array of search queries for X posts (recommended 3–5). If the user gives a link to a post, put it first."
          ),
        startDate: z
          .string()
          .optional()
          .describe("Start date YYYY-MM-DD (defaults to 15 days ago)."),
        endDate: z
          .string()
          .optional()
          .describe("End date YYYY-MM-DD (defaults to today)."),
        includeXHandles: z
          .array(z.string())
          .max(10)
          .optional()
          .describe(
            "X handles to include (max 10). Cannot be combined with excludeXHandles."
          ),
        excludeXHandles: z
          .array(z.string())
          .max(10)
          .optional()
          .describe(
            "X handles to exclude (max 10). Cannot be combined with includeXHandles."
          ),
      })
      .refine(
        (input) =>
          !(input.includeXHandles?.length && input.excludeXHandles?.length),
        {
          message:
            "Cannot specify both includeXHandles and excludeXHandles — use one or the other.",
          path: ["includeXHandles"],
        }
      ),
    async execute({
      queries,
      startDate,
      endDate,
      includeXHandles,
      excludeXHandles,
    }) {
      if (!process.env.XAI_API_KEY) {
        return {
          queries,
          error: "X search is unavailable because it is not configured.",
          results: [],
        }
      }

      const sanitize = (handle: string) => handle.replace(/^@+/, "").trim()
      const include = includeXHandles?.map(sanitize).filter(Boolean)
      const exclude = excludeXHandles?.map(sanitize).filter(Boolean)
      const toYMD = (date: Date) => date.toISOString().slice(0, 10)
      const extractId = (url: string) => url.match(/status\/(\d+)/)?.[1] ?? null
      const start =
        startDate?.trim() || toYMD(new Date(Date.now() - 15 * 86_400_000))
      const end = endDate?.trim() || toYMD(new Date())

      const outcomes = await Promise.all(
        queries.map(async (query): Promise<QueryOutcome> => {
          try {
            const config: Parameters<typeof xai.tools.xSearch>[0] = {
              fromDate: start,
              toDate: end,
            }
            if (include?.length) config.allowedXHandles = include
            if (exclude?.length) config.excludedXHandles = exclude

            const { sources } = await dependencies.generateText({
              model: xai.responses("grok-4.20-0309-non-reasoning"),
              system:
                "Search X for relevant posts using the x_search tool (max 30 results). Do not write any text after running the tool.",
              messages: [{ role: "user", content: query }],
              maxOutputTokens: 5,
              stopWhen: stepCountIs(1),
              tools: { x_search: xai.tools.xSearch(config) },
            })

            const citations = (
              Array.isArray(sources) ? sources : []
            ) as CitationSource[]
            const urls = citations
              .filter((citation) => citation.sourceType === "url")
              .map((citation) => citation.url ?? "")
              .filter(Boolean)

            const seen = new Set<string>()
            const tweets = await Promise.all(
              urls.map(async (url): Promise<Tweet | null> => {
                const id = extractId(url)
                if (!id || seen.has(id)) return null
                seen.add(id)
                try {
                  const tweet = await dependencies.getTweet(id)
                  if (!tweet?.text) return null
                  const handle = tweet.user?.screen_name ?? null
                  return {
                    text: tweet.text,
                    url: handle ? `https://x.com/${handle}/status/${id}` : url,
                    handle,
                    id,
                  }
                } catch {
                  return null
                }
              })
            )
            return {
              kind: "success",
              tweets: tweets.filter((tweet): tweet is Tweet => tweet !== null),
            }
          } catch (error) {
            return { kind: "failure", failure: failureOf(error) }
          }
        })
      )

      const failures = outcomes
        .filter(
          (outcome): outcome is Extract<QueryOutcome, { kind: "failure" }> =>
            outcome.kind === "failure"
        )
        .map((outcome) => outcome.failure)
      if (failures.length > 0) {
        console.error("x_search provider failure", {
          queryCount: queries.length,
          status: failures.includes("authorization")
            ? "authorization"
            : "provider",
        })
      }

      const seenIds = new Set<string>()
      const results = outcomes
        .flatMap((outcome) =>
          outcome.kind === "success" ? outcome.tweets : []
        )
        .filter((tweet) => !seenIds.has(tweet.id) && seenIds.add(tweet.id))
        .map((tweet) => ({
          title: tweet.handle ? `@${tweet.handle}` : "Post on X",
          url: tweet.url,
          text: tweet.text,
        }))
      const error = errorFor(failures)

      if (error) return { queries, error, results }
      return { queries, dateRange: `${start} to ${end}`, results }
    },
  })
}

export default createXSearchTool()
