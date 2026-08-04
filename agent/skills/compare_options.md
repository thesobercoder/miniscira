---
description: Use to compare two or more options head-to-head (products, tools, services, frameworks, models, or approaches) and recommend one. Triggers on "compare", "X vs Y", "which is better", "best … for …".
---

# Compare options

Follow this when the user wants a head-to-head comparison and a recommendation.

## 1. Frame the comparison

- Identify the **options** being compared and the **criteria** that matter
  (e.g. price, performance, features, ecosystem, learning curve, support).
- If either the options or the deciding criteria are unclear, ask once with
  `ask_question` (e.g. "What's your budget and main use case?").
- Put each option on the `todo` list, and mark it `completed` as you finish
  researching it — the list is the only progress the reader sees.

## 2. Research each option in parallel

- **Delegate one `agent` subagent per option**, running them at once. Give each
  the same brief: research this option against the agreed criteria, using
  multiple `firecrawl_search` queries and `firecrawl_scrape` on primary/official sources, and
  return the findings **with source URLs**.
- Prefer official pages, docs, and pricing for hard facts (`exa_search` finds the
  authoritative sources fastest); reputable reviews and recent (dated) comparisons
  for judgment calls. Use **`reddit_search`** for real user experiences with each
  option, and **`x_search`** for recent expert takes; they often surface
  trade-offs the marketing pages won't.

## 3. Build the comparison

- Produce a **Markdown comparison table**: rows = criteria, columns = options.
  Keep cells short and factual; cite the source on any non-obvious value.
- Below the table, give 1–2 sentences of **trade-offs** per option (where each
  one wins and loses).

## 4. Recommend

- Lead with a clear **bottom line**: which option to pick, for whom, and why.
- Note when the answer changes by use case ("pick X if …, pick Y if …").
- Flag anything that's close, contested, or depends on details you don't have.

## Citations

- Cite every factual value and claim inline with a Markdown link
  `[Title](https://example.com/url)`. Only cite URLs you (or your subagents)
  actually retrieved. Never fabricate a source.
