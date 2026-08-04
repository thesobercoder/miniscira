import { describe, expect, test } from "bun:test"

import { lexicalShortlist } from "@/lib/rag"

const passages = [
  "The transformer architecture relies entirely on attention mechanisms.",
  "We evaluate on CASP14 and CAMEO benchmarks against baselines.",
  "Training used 8 GPUs for roughly two weeks of wall-clock time.",
  "Figure 3 shows the loss curve over the course of training.",
  "Acknowledgements: we thank our colleagues for helpful discussion.",
]
const shortlist = (query: string, keep: number, items = passages) =>
  lexicalShortlist(query, items, (p) => p, keep)

describe("lexicalShortlist", () => {
  test("ranks passages sharing rare query terms first", () => {
    const out = shortlist("CASP14 benchmarks", 2)
    expect(out[0]).toBe(
      "We evaluate on CASP14 and CAMEO benchmarks against baselines."
    )
  })

  test("weights a rare term above a common one", () => {
    // "training" appears twice, "GPUs" once — the rarer term should win even
    // though both passages match exactly one query term.
    const out = shortlist("training GPUs", 1)
    expect(out[0]).toContain("GPUs")
  })

  // The invariant: the shortlist decides what the reranker LOOKS at, never what
  // is relevant. Every branch below must hand back the full field.
  test("returns everything when the query has no usable terms", () => {
    expect(shortlist("what is it and how are they", 2)).toEqual(passages)
  })

  test("returns everything when nothing matches lexically", () => {
    expect(shortlist("photosynthesis chlorophyll", 2)).toEqual(passages)
  })

  test("returns everything when the corpus already fits", () => {
    expect(shortlist("attention", passages.length)).toEqual(passages)
    expect(shortlist("attention", passages.length + 10)).toEqual(passages)
  })

  test("fills spare slots with unmatched passages rather than returning fewer", () => {
    // Only one passage mentions attention, but there is room for three — the
    // other two slots go to unmatched passages instead of being left empty.
    // Returning just the match cost 2 of 6 real results in the measured corpus.
    const out = shortlist("attention", 3)
    expect(out).toHaveLength(3)
    expect(out[0]).toContain("attention")
  })

  test("never returns more than asked for", () => {
    expect(shortlist("training loss figure evaluate", 2)).toHaveLength(2)
  })

  test("handles an empty corpus", () => {
    expect(shortlist("anything", 5, [])).toEqual([])
  })
})
