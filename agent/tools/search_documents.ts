import { and, eq, isNotNull, isNull, or } from "drizzle-orm"
import { defineTool } from "eve/tools"
import { z } from "zod"
import { db } from "@/lib/db"
import { chat, document } from "@/lib/db/schema"
import { chunkText, lexicalShortlist, rerankByRelevance } from "@/lib/rag"

/**
 * Retrieval without an embedding index.
 *
 * The previous shape was vector-retrieve-then-rerank: embed every chunk at
 * upload, ANN-search for candidates, then score those with a cross-encoder.
 * Stage 1 exists to narrow a large corpus down to something the reranker can
 * afford — but this corpus is ~190 chunks across the whole install, so there was
 * nothing to narrow. It paid for an embedding call per chunk, a query embedding
 * per search, a vector table, and a second copy of every document that could
 * drift from the blob, to skip an expense that did not exist.
 *
 * Now the extracted text is cached on `document.content` at upload, chunked in
 * memory here (sub-millisecond), and the reranker scores the whole scope
 * directly. One model call per search, no index to maintain, and an extractor
 * upgrade re-chunks everything for free.
 *
 * This trades a fixed per-document cost for a per-query cost that grows with the
 * corpus, so the expensive scorer is fed deliberately:
 *
 *   chunk everything → lexical shortlist (in-memory) → cross-encoder rerank
 *
 * The shortlist is what keeps that affordable, and SHORTLIST_KEEP is measured,
 * not guessed. Against a 216-passage corpus, comparing each setting's top-6
 * with the top-6 from reranking everything:
 *
 *   keep  40 → 4/6   keep  80 → 5/6   keep 140 → 6/6
 *   keep  60 → 4/6   keep 100 → 6/6   no filter → 6/6 (~1.4-1.7x slower)
 *
 * 100 is the smallest value that loses nothing. Anything below it silently drops
 * passages a full rerank would have surfaced — the failing query was "what
 * datasets were used for evaluation", where the relevant passages say
 * "benchmarks" and name the sets, sharing no term with the question. Re-measure
 * before lowering it; the number is a property of the corpus, not a preference.
 *
 * MAX_CANDIDATES is the backstop for the case where the shortlist declines to
 * narrow (a query with no usable terms, or nothing matching lexically). Past it,
 * ranking everything stops being the cheap option and an ANN index earns its
 * place back.
 */
const SHORTLIST_KEEP = 100
const MAX_CANDIDATES = 200

/**
 * The project this turn is running inside, or null.
 *
 * eve hands tools no per-turn client context — `ctx.session` carries auth, the
 * session id, and turn metadata, nothing else — so the project is recovered the
 * same way `agent/hooks/persist-session-cursor.ts` recovers the chat: by the
 * durable session id stored on `chat.eve_session_id`. Subagents look the id up
 * through their root session so a delegated search stays in the same project.
 *
 * Returns null when the mapping is not (yet) there — the browser PATCHes
 * `eveSessionId` as the first turn streams — in which case retrieval falls back
 * to user-wide scope rather than silently returning nothing.
 */
async function activeProjectId(
  sessionId: string,
  userId: string
): Promise<string | null> {
  try {
    const rows = await db
      .select({ projectId: chat.projectId })
      .from(chat)
      .where(and(eq(chat.eveSessionId, sessionId), eq(chat.userId, userId)))
      .limit(1)
    return rows[0]?.projectId ?? null
  } catch (err) {
    console.error("project scope lookup failed; searching user-wide", err)
    return null
  }
}

// The model sees this tool as `search_documents`, from the filename.
export default defineTool({
  description:
    "Semantic search over the user's uploaded documents (their personal knowledge base). Use this whenever the user refers to a file they uploaded, asks about 'my document/PDF/notes', or when the answer may live in their files. Returns the most relevant passages, ranked by a cross-encoder, each tagged with its source filename. Attribute claims to the document by name.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe("What to look for, phrased as a question or topic."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(12)
      .optional()
      .describe("How many passages to return after ranking (default 6)."),
  }),
  async execute({ query, limit = 6 }, ctx) {
    const userId = ctx.session.auth.current?.principalId
    if (!userId || ctx.session.auth.current?.principalType !== "user") {
      return {
        query,
        error: "No authenticated user — cannot search documents.",
        results: [],
      }
    }

    // Scoped to the user and, inside a project chat, to that project plus any
    // unfiled documents — the same scoping the vector filters applied.
    const rootSessionId = ctx.session.parent?.rootSessionId ?? ctx.session.id
    const projectId = await activeProjectId(rootSessionId, userId)

    const rows = await db
      .select({ filename: document.filename, content: document.content })
      .from(document)
      .where(
        and(
          eq(document.userId, userId),
          eq(document.kind, "document"),
          isNotNull(document.content),
          projectId
            ? or(eq(document.projectId, projectId), isNull(document.projectId))
            : undefined
        )
      )

    const candidates = rows.flatMap((row) =>
      chunkText(row.content ?? "").map((content) => ({
        filename: row.filename,
        content,
      }))
    )

    if (candidates.length === 0) {
      return {
        query,
        results: [],
        note: "No documents have been uploaded yet, or none have extractable text.",
      }
    }

    // Narrow lexically first; this returns the full field when it has no basis
    // to choose, which is why the cap below still has to exist.
    const shortlisted = lexicalShortlist(
      query,
      candidates,
      (c) => c.content,
      SHORTLIST_KEEP
    )
    // Dropping passages the reranker never saw is a real event, not an
    // implementation detail: say so rather than quietly ranking a slice.
    const truncated = shortlisted.length > MAX_CANDIDATES
    const scored = truncated
      ? shortlisted.slice(0, MAX_CANDIDATES)
      : shortlisted

    try {
      const reranked = await rerankByRelevance(
        query,
        scored,
        (r) => r.content,
        limit
      )
      return {
        query,
        results: reranked.map(({ item, score }) => ({
          filename: item.filename,
          content: item.content,
          score: Number(score.toFixed(3)),
        })),
        ...(truncated && {
          note: `Ranked the first ${MAX_CANDIDATES} of ${candidates.length} passages; results may be incomplete.`,
        }),
      }
    } catch (err) {
      // Without the reranker there is no ordering left, so return the opening
      // passages and say they are unranked rather than implying relevance.
      console.error("document rerank failed; returning unranked passages", err)
      return {
        query,
        results: scored.slice(0, limit).map((r) => ({
          filename: r.filename,
          content: r.content,
        })),
        note: "Ranking was unavailable — these passages are in document order, not by relevance.",
      }
    }
  },
})
