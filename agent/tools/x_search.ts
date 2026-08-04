import { xai } from "@ai-sdk/xai"
import { generateText, stepCountIs } from "ai"
import { defineTool } from "eve/tools"
import { getTweet } from "react-tweet/api"
import { z } from "zod"

type CitationSource = { sourceType?: string; url?: string }
type Tweet = { text: string; url: string; handle: string | null; id: string }

// The model sees this tool as `x_search`, from the filename.
export default defineTool({
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
    .refine((d) => !(d.includeXHandles?.length && d.excludeXHandles?.length), {
      message:
        "Cannot specify both includeXHandles and excludeXHandles — use one or the other.",
      path: ["includeXHandles"],
    }),
  async execute({
    queries,
    startDate,
    endDate,
    includeXHandles,
    excludeXHandles,
  }) {
    if (!process.env.XAI_API_KEY) {
      return { queries, error: "XAI_API_KEY is not configured.", results: [] }
    }

    const sanitize = (h: string) => h.replace(/^@+/, "").trim()
    const include = includeXHandles?.map(sanitize).filter(Boolean)
    const exclude = excludeXHandles?.map(sanitize).filter(Boolean)
    const toYMD = (d: Date) => d.toISOString().slice(0, 10)
    const extractId = (url: string) => url.match(/status\/(\d+)/)?.[1] ?? null
    const start =
      startDate?.trim() || toYMD(new Date(Date.now() - 15 * 86_400_000))
    const end = endDate?.trim() || toYMD(new Date())

    const perQuery = await Promise.all(
      queries.map(async (query): Promise<Tweet[]> => {
        try {
          const config: Parameters<typeof xai.tools.xSearch>[0] = {
            fromDate: start,
            toDate: end,
          }
          if (include?.length) config.allowedXHandles = include
          if (exclude?.length) config.excludedXHandles = exclude

          const { sources } = await generateText({
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
            .filter((c) => c.sourceType === "url")
            .map((c) => c.url ?? "")
            .filter(Boolean)

          const seen = new Set<string>()
          const tweets = await Promise.all(
            urls.map(async (url): Promise<Tweet | null> => {
              const id = extractId(url)
              if (!id || seen.has(id)) return null
              seen.add(id)
              try {
                const t = await getTweet(id)
                if (!t?.text) return null
                const handle = t.user?.screen_name ?? null
                return {
                  text: t.text,
                  url: handle ? `https://x.com/${handle}/status/${id}` : url,
                  handle,
                  id,
                }
              } catch {
                return null
              }
            })
          )
          return tweets.filter((t): t is Tweet => t !== null)
        } catch (err) {
          console.error(`x_search failed for "${query}"`, err)
          return []
        }
      })
    )

    const seenIds = new Set<string>()
    const results = perQuery
      .flat()
      .filter((t) => !seenIds.has(t.id) && seenIds.add(t.id))
      .map((t) => ({
        title: t.handle ? `@${t.handle}` : "Post on X",
        url: t.url,
        text: t.text,
      }))

    return { queries, dateRange: `${start} to ${end}`, results }
  },
})
