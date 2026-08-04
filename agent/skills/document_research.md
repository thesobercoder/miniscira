---
description: Use when the answer should come from the user's own uploaded files (their knowledge base). Triggers when the user mentions "my document/PDF/report/notes", asks you to summarize/extract from an upload, or when `uploadedDocuments` appears in the context.
---

# Document research

Follow this to answer from the user's uploaded documents, optionally combined with
the web.

## 1. Search their documents first

- Call **`search_documents`** with the user's question (or a focused sub-topic)
  phrased as a query. Run it **2–4 times with different phrasings** when the
  question has multiple facets; each call reranks the most relevant passages.
- Read the returned passages carefully. Each is tagged with its source
  `filename`; note which file each fact comes from.
- If nothing relevant comes back, say so plainly and ask whether they meant a
  different file. Do not invent contents.

## 2. Combine with the web only when needed

- If the question needs current facts, definitions, or corroboration the documents
  don't contain, supplement with `firecrawl_search`/`firecrawl_scrape`. Keep document-sourced
  claims and web-sourced claims clearly distinguishable.
- For "compare my document to X" or "is my report still accurate?" tasks, verify
  the document's claims against fresh web sources and flag any that are outdated.

## 3. Answer with attribution

- Lead with the direct answer, then support it with specifics drawn from the
  passages (figures, quotes, section names).
- **Attribute every document-sourced claim to its file by name**, e.g.
  "According to **q3-report.pdf**, …". Quote short, exact phrases when wording
  matters.
- If passages from different files disagree, surface the conflict rather than
  silently picking one.

## Citations

- For web sources, link inline with `[Title](https://example.com/url)` as usual.
- For document sources, name the **filename** in the sentence (there is no URL to
  link). Never present a document claim as if it were web-verified, or vice versa.
