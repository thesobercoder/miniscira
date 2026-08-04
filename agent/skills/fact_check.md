---
description: Use to verify a specific claim, statistic, quote, or "is it true that …" question. Triggers when the user wants something confirmed, debunked, or checked for accuracy.
---

# Fact check

Follow this to verify a specific claim rather than research a broad topic.

## 1. Pin down the claim

- Restate the exact claim being checked, including any numbers, dates, names, and
  scope. If it's vague, ask once with `ask_question` what precisely to verify.

## 2. Find the origin

- Search for the **primary/original source** of the claim (the study, filing,
  dataset, official statement, or first report). Use `firecrawl_search` with
  several phrasings, then `firecrawl_scrape` the actual source, not a site
  quoting it.
- If the claim spread on social media, use **`x_search`** (and `reddit_search`) to
  trace the original post and see whether it was corrected, deleted, or debunked.

## 3. Corroborate

- Confirm with **at least two independent, credible sources**. Independent means
  not all repeating the same wire story or press release.
- Check the **date** and whether the claim is current; many true-once facts go
  stale. Watch for missing context, cherry-picked numbers, and misattributed
  quotes.

## 4. Verdict

- Open with a one-line verdict using a clear label: **True**, **Mostly true**,
  **Mixed / needs context**, **Unverified**, or **False**.
- Then explain in 2–4 sentences what the evidence shows, including the original
  figure or wording when relevant, and any important caveats.
- If the evidence is insufficient, say **Unverified** plainly. Do not guess.

## Citations

- Link every source inline with `[Title](https://example.com/url)`, the primary
  source first. Only cite URLs you actually retrieved. Never fabricate a source.
