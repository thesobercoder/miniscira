---
description: Use when the user asks to create, inspect, combine, split, or make a small edit to a PDF file.
---

# Work with PDF files

Use Python in `run_code`. The Sandbox already has `reportlab` and `pypdf`. Do not install packages during the chat.

## Create

1. Use `reportlab` to write a PDF in `/workspace`.
2. Pick a clear filename ending in `.pdf`.
3. Use page sizes, margins, fonts, and paragraph spacing that make the file readable.
4. Keep text inside page bounds. Add pages instead of shrinking text to fit.

## Inspect or edit

1. Use `pypdf.PdfReader` to inspect page count, metadata, and extractable text.
2. For combine, split, rotate, reorder, metadata, or overlay work, use `pypdf.PdfWriter`.
3. PDF is not a general editable document format. If the requested change needs reflow, recreate the affected pages or ask for the source document.

## Verify

Before finishing, reopen the output with `pypdf.PdfReader` and check:

- the file opens without an exception;
- the page count is expected;
- required text is present when text extraction applies;
- the final path and filename are correct.

Leave the finished `.pdf` file in `/workspace`. `run_code` returns it as a download.
