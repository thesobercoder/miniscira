---
description: Use for "what's new / latest / recent developments" questions where recency is the point, covering news, releases, updates, or the current state of a fast-moving topic.
---

# News brief

Follow this when the user wants the latest on a topic and recency matters most.

## 1. Scope it

- Identify the topic and the time window that matters (today, this week, since a
  given event). State the current date in your answer so freshness is clear.

## 2. Find recent, dated sources

- Run `firecrawl_search` with recency-oriented queries (include the year/month, and
  terms like "latest", "update", "announced"). Favor reputable outlets and
  official announcements.
- `firecrawl_scrape` the most important items to confirm details and **publication
  dates**, and discard or down-weight anything undated or stale.
- For breaking or developing stories, use **`x_search`** for real-time, on-the-record
  reactions and primary posts (scope to the last day or two), and confirm anything
  load-bearing against a reputable outlet before stating it as fact.
- For broad topics, delegate distinct angles to parallel `agent` subagents
  (e.g. one per company/thread), each returning dated findings with URLs.

## 3. Brief the user

- Lead with a 2–3 sentence **what's new** summary.
- Then a short, **dated** list of developments, newest first
  (`**2026-06-28** — …`). Keep each item to a sentence or two.
- Separate confirmed facts from rumor/speculation, and note what's still
  expected or unconfirmed.

## Citations

- Link each development inline with `[Title](https://example.com/url)`. Only cite
  URLs you actually retrieved. Never fabricate a source.
