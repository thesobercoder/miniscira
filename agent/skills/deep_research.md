---
description: Use for deep, multi-source research reports, when the user asks to "deep research", investigate a topic in depth, or wants a thorough cited write-up.
---

# Deep research methodology

Follow this when the user wants a thorough answer rather than a quick lookup.

## 1. Decompose

- Restate the question and break it into 3–6 concrete sub-questions.
- If the question is ambiguous in a way that changes the answer, ask once with
  the `ask_question` tool before doing heavy work.
- Put the sub-questions on the `todo` list, then **keep it current** — the plan
  should reflect real progress, not the initial outline:
  - Mark every sub-question you are about to delegate `in_progress` in a single
    `todo` call *before* firing the parallel `researcher` calls.
  - Mark each one `completed` as its brief comes back, not all at the end.
  - The list must be fully resolved before you start writing the report.
  This is the step most often skipped on a fan-out: delegating three researchers
  at once feels like one action, so the plan never moves off zero.

## 2. Gather broadly (in parallel)

- For independent sub-questions, **delegate each to a parallel `researcher`
  subagent** so they run at once. The researcher is a search specialist that
  returns a Markdown brief with inline source-URL citations. Give each a
  self-contained, non-overlapping task; spawn several in one response to run them
  concurrently. (Use the generic `agent` tool only for non-research delegation.)
- For sub-questions you handle yourself, run `firecrawl_search` with several
  focused queries from different angles (official source, critical analysis,
  recent news, primary data), then open the strongest hits with
  `firecrawl_scrape`.
- Match the tool to the source: **`exa_search`** for the most relevant/authoritative
  or semantic results, **`firecrawl_scrape`** when a page is messy or JS-rendered,
  and **`x_search`** / **`reddit_search`** for real-time reactions and on-the-ground
  community signal on contested or fast-moving sub-questions.
- If the user has uploaded files (look for `uploadedDocuments` in the context),
  search them with **`search_documents`** as a first-class source and attribute
  those findings to the document by filename.
- Do not rely on snippets for anything load-bearing. Read the page.

## 3. Verify

- Treat a claim as confirmed only when **two independent, credible sources**
  agree. Flag anything single-sourced, contested, or out of date.
- Prefer primary sources and official documentation over aggregators.
- Note each source's publication date; discount stale information when the topic
  moves fast.

## 4. Synthesize

- Lead with a direct, 2–4 sentence answer to the overall question.
- Then organize the detail into clear sections (one per sub-question or theme).
- Use tables for comparisons and bullet lists for enumerations.
- Surface disagreement between sources explicitly instead of averaging it away.
- Close with a short "What's uncertain" note when meaningful gaps remain.

## 5. Cite inline, never a reference list

- Cite every factual claim **inline**, as a Markdown link on the words it supports:
  `SiFive [raised $400M](https://example.com/exact-url) in 2026.`
- **A long report changes nothing.** No matter how many sources you gathered across
  subagents, the citations stay inline. **Do NOT** end with a `## Sources`,
  `## References`, or `## Citations` section, a numbered link list, footnotes
  (`[^1]`), `[1]`-style markers, or `↩` backlinks. The links are the citations.
- **Nor a cluster of links at the end of a paragraph.** With many subagent sources the
  tempting shortcut is to close each paragraph with `(source) (source) (source)`. That
  is the banned reference list, one per paragraph. Distribute them:
  - Wrong: `Bun leads synthetic benchmarks and Vercel ships it natively.
    ([TechEmpower](https://a.com)) ([Vercel](https://b.com))`
  - Right: `Bun [leads synthetic benchmarks](https://a.com) and
    [Vercel ships it natively](https://b.com).`
- **Never make the link text an identifier for the source.** Link text is words from your
  own sentence. A source name (`[(TechEmpower benchmarks)](url)`), a bare domain
  (`[caniuse.com/http3](url)`), or a raw URL are the same mistake with or without
  parentheses: an identifier has nowhere to sit but after the sentence, which is how
  clusters start. A parenthesised `(source; source)` tail is a reference list too.
- **The link goes inside the sentence, before the period.** Never after the closing
  punctuation, and never with a period on both sides of the link. Two citation links may
  never be adjacent. If a source has no distinct detail of its own to sit on, drop it.
- Only cite URLs you actually retrieved (including those returned by your
  subagents). Never fabricate a source.
