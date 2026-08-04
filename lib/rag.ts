import { gateway, rerank } from "ai"

/**
 * Chunking and reranking — the retrieval half of RAG.
 *
 * File parsing lives in `lib/document-text.ts` on purpose: it depends on a
 * native `.node` addon that eve's Rolldown-based agent bundler cannot load, and
 * `agent/tools/search_documents.ts` imports this module. Keep this file free of
 * heavy or platform-specific dependencies.
 */

// Cross-encoder reranker, via the Vercel AI Gateway (no separate provider key).
const RERANK_MODEL = "cohere/rerank-v4-fast"

/** Split text into overlapping, paragraph-aware chunks. */
export function chunkText(input: string, size = 1400, overlap = 200): string[] {
  const text = input
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
  if (!text) return []

  const paragraphs = text.split(/\n{2,}/)
  const chunks: string[] = []
  let current = ""

  const flush = () => {
    const trimmed = current.trim()
    if (trimmed) chunks.push(trimmed)
  }

  for (const para of paragraphs) {
    if (current && current.length + para.length + 2 > size) {
      flush()
      // carry an overlap tail for continuity across the boundary
      current = `${current.slice(-overlap)}\n\n${para}`
    } else {
      current = current ? `${current}\n\n${para}` : para
    }
  }
  flush()

  // Hard-split any chunk that's still far over the target (e.g. one huge paragraph).
  return chunks.flatMap((chunk) => {
    if (chunk.length <= size * 1.5) return [chunk]
    const out: string[] = []
    for (let i = 0; i < chunk.length; i += size - overlap) {
      out.push(chunk.slice(i, i + size))
    }
    return out
  })
}

// Words that appear in almost any passage carry no signal and would otherwise
// dominate a short query ("what does the paper say about X" is mostly stopwords).
const STOPWORDS = new Set(
  "a an and are as at be but by can do does for from had has have how i if in into is it its of on or our she that the their then there these they this to was we were what when where which who why will with would you your".split(
    " "
  )
)

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))

/**
 * Cheap lexical shortlist, run before the cross-encoder.
 *
 * The reranker is the accurate scorer but costs a model call proportional to
 * how much you hand it — 216 passages measured at ~2.2s. This trims the field
 * in-memory first (microseconds) so the expensive scorer only sees plausible
 * candidates.
 *
 * Scoring is BM25-shaped without the ceremony: each query term contributes its
 * inverse document frequency, so a term appearing in most passages is worth
 * little and a rare one is worth a lot, and per-passage term frequency
 * saturates (`tf / (tf + 1)`) so repeating a word cannot outweigh matching more
 * distinct terms.
 *
 * INVARIANT: this must never be the reason a relevant passage is missed. When
 * the query has no usable terms, or too few passages match to fill the
 * shortlist, it returns everything and lets the reranker do the real work —
 * lexical overlap is a hint about where to look, not a judgement.
 */
export function lexicalShortlist<T>(
  query: string,
  candidates: T[],
  getText: (candidate: T) => string,
  keep: number
): T[] {
  const terms = [...new Set(tokenize(query))]
  if (terms.length === 0 || candidates.length <= keep) return candidates

  const tokenized = candidates.map((c) => tokenize(getText(c)))
  const docFreq = new Map<string, number>()
  for (const tokens of tokenized) {
    const seen = new Set(tokens)
    for (const term of terms)
      if (seen.has(term)) docFreq.set(term, (docFreq.get(term) ?? 0) + 1)
  }

  const scored = tokenized.map((tokens, i) => {
    const counts = new Map<string, number>()
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1)
    let score = 0
    for (const term of terms) {
      const tf = counts.get(term) ?? 0
      if (tf === 0) continue
      const df = docFreq.get(term) ?? 0
      // +1s keep the log positive and defined when a term matches everything.
      const idf = Math.log(1 + (candidates.length - df + 0.5) / (df + 0.5))
      score += idf * (tf / (tf + 1))
    }
    return { index: i, score }
  })

  const matched = scored.filter((s) => s.score > 0)
  // Nothing matched lexically — the query is probably phrased differently from
  // the source. Hand the reranker the full field rather than nothing.
  if (matched.length === 0) return candidates

  matched.sort((a, b) => b.score - a.score)
  const picked = matched.slice(0, keep)

  // Fewer lexical matches than we have room for does NOT mean the rest are
  // irrelevant — a passage can answer "what datasets were used" while saying
  // "benchmarks" and naming them. Measured: returning only the 36 matches for
  // that query cost 2 of the 6 results a full rerank found. So fill the
  // remaining slots with unmatched passages in document order; the budget is
  // spent either way, and the reranker gets to see them.
  if (picked.length < keep) {
    const taken = new Set(picked.map((s) => s.index))
    for (const s of scored) {
      if (picked.length >= keep) break
      if (!taken.has(s.index)) picked.push(s)
    }
  }

  return picked.map((s) => candidates[s.index])
}

/**
 * Rerank candidates by relevance to the query with a cross-encoder reranker
 * (more accurate than the embedding cosine score). Returns the top-N candidates
 * paired with the reranker's relevance score, most relevant first.
 */
export async function rerankByRelevance<T>(
  query: string,
  candidates: T[],
  getText: (candidate: T) => string,
  topN: number
): Promise<{ item: T; score: number }[]> {
  if (candidates.length <= 1)
    return candidates.map((item) => ({ item, score: 1 }))
  const { ranking } = await rerank({
    model: gateway.rerankingModel(RERANK_MODEL),
    documents: candidates.map(getText),
    query,
    topN: Math.min(topN, candidates.length),
  })
  return ranking.map((r) => ({
    item: candidates[r.originalIndex],
    score: r.score,
  }))
}
