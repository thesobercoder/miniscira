---
description: Use when the user asks to create or edit a Microsoft Word DOCX document.
---

# Work with DOCX files

Use Python in `run_code`. The Sandbox already has `python-docx`. Do not install packages during the chat.

## Create

1. Use `docx.Document()`.
2. Set page margins and normal text styles before adding content.
3. Use real headings, paragraphs, lists, tables, page breaks, headers, and footers instead of visual spacing tricks.
4. Save the result in `/workspace` with a clear `.docx` filename.

## Edit

1. Open the uploaded file by its staged filename with `docx.Document(path)`.
2. Make the smallest requested change. Preserve untouched sections and styles where `python-docx` exposes them.
3. Save to a new output filename unless the user explicitly wants the original name replaced.
4. Avoid replacing all paragraph text when changing one run. That discards run-level formatting.

## Verify

Reopen the saved file with `docx.Document`. Check the required headings, text, tables, and section count. Confirm that the output is not empty.

Leave the finished `.docx` file in `/workspace`. `run_code` returns it as a download.
