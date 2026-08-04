import { describe, expect, test } from "bun:test"

import { normalizeCitations } from "@/components/markdown"

/**
 * Inputs are verbatim citation shapes taken from `message.completed` events in
 * the database, not invented ones — the renderer kept missing the shape the
 * agent actually produces.
 */
describe("normalizeCitations", () => {
  test("folds an academic bracket-wrapped citation into the chip shape", () => {
    const input =
      "Roadmap emphasizes scalable manufacturing. [[Fortune Business Insights (2026 report)](https://www.fortunebusinessinsights.com/ev-solid-state-battery-market-115751)]"
    expect(normalizeCitations(input)).toBe(
      "Roadmap emphasizes scalable manufacturing. [(Fortune Business Insights (2026 report))](https://www.fortunebusinessinsights.com/ev-solid-state-battery-market-115751)"
    )
  })

  test("handles several links inside one bracket pair", () => {
    const input = "[[A](https://a.com), [B](https://b.com)]"
    expect(normalizeCitations(input)).toBe(
      "[(A)](https://a.com) [(B)](https://b.com)"
    )
  })

  test("still folds the parenthesised run", () => {
    const input =
      "Firefox has quirks. ([hacks.mozilla.org/2021/04](https://hacks.mozilla.org/2021/04))"
    expect(normalizeCitations(input)).toBe(
      "Firefox has quirks. [(hacks.mozilla.org/2021/04)](https://hacks.mozilla.org/2021/04)"
    )
  })

  test("does not double-wrap an already parenthesised label", () => {
    const input = "[[(Safari 26 release notes)](https://webkit.org/notes)]"
    expect(normalizeCitations(input)).toBe(
      "[(Safari 26 release notes)](https://webkit.org/notes)"
    )
  })

  test("chips a run of adjacent source-name links", () => {
    // Verbatim from the running app: three long green links wrapping across two
    // lines at the end of a paragraph.
    const input =
      "at fractions of prior costs. [Official GPT-5 announcement](https://openai.com/a) [o3 and o4-mini announcement](https://openai.com/b) [GPT-5.6 announcement](https://openai.com/c)."
    // The trailing period is dropped on purpose: once the run becomes chips,
    // DUPLICATE_TERMINATOR sees `costs. <chips> .` and keeps one stop, so the
    // sentence ends before the chips instead of showing a stranded full stop.
    expect(normalizeCitations(input)).toBe(
      "at fractions of prior costs. [(Official GPT-5 announcement)](https://openai.com/a) [(o3 and o4-mini announcement)](https://openai.com/b) [(GPT-5.6 announcement)](https://openai.com/c)"
    )
  })

  test("absorbs bold wrappers around an adjacent run", () => {
    const input =
      "**[GPT-5 announcement](https://openai.com/a)** **[Model release notes](https://help.openai.com/b)**"
    expect(normalizeCitations(input)).toBe(
      "[(GPT-5 announcement)](https://openai.com/a) [(Model release notes)](https://help.openai.com/b)"
    )
  })

  test("leaves a single inline link in a run of prose alone", () => {
    // One link is not a citation run — chipping it would eat real prose links.
    const input =
      "See the [official announcement](https://openai.com/a) for details."
    expect(normalizeCitations(input)).toBe(input)
  })

  test("leaves a prose-anchored link alone", () => {
    // The documented GOOD shape: the claim words carry the link, so it must stay
    // an underlined inline link and never collapse into a chip.
    const input =
      "Checkout latency [dropped to 340ms](https://example.com/post) after the switch."
    expect(normalizeCitations(input)).toBe(input)
  })

  test("leaves prose parentheses containing a link alone", () => {
    const input = "(see [the docs](https://example.com/docs) for details)"
    expect(normalizeCitations(input)).toBe(input)
  })

  test("leaves markdown image syntax alone", () => {
    const input = "![a chart](https://example.com/chart.png)"
    expect(normalizeCitations(input)).toBe(input)
  })

  test("returns non-link prose untouched", () => {
    expect(normalizeCitations("no links here at all")).toBe(
      "no links here at all"
    )
  })
})
