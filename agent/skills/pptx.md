---
description: Use when the user asks to create or edit a Microsoft PowerPoint PPTX presentation.
---

# Work with PPTX files

Use Python in `run_code`. The Sandbox already has `python-pptx`. Do not install packages during the chat.

## Create

1. Use `pptx.Presentation()` and set a 16:9 slide size unless the user requests another size.
2. Give each slide one clear purpose. Use short titles, readable body text, and consistent spacing.
3. Prefer built-in layouts. Add shapes, tables, charts, and images only when they help the message.
4. Save the deck in `/workspace` with a clear `.pptx` filename.

## Edit

1. Open the staged upload with `pptx.Presentation(path)`.
2. Change only the requested slides or shapes.
3. Preserve the existing theme and layouts where possible.
4. Save to a new output filename unless the user explicitly wants the original name replaced.

## Verify

Reopen the output with `pptx.Presentation`. Check the slide count and required slide titles or text. Inspect every slide for empty placeholders and text that is too long for its box. Keep body text large enough to read in a presentation.

Leave the finished `.pptx` file in `/workspace`. `run_code` returns it as a download.
