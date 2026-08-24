---
description: Use when the user asks to create, inspect, calculate, or edit a Microsoft Excel XLSX workbook.
---

# Work with XLSX files

Use Python in `run_code`. The Sandbox already has `openpyxl`. Do not install packages during the chat.

## Create

1. Use `openpyxl.Workbook()`.
2. Give worksheets clear names. Add headers, number formats, widths, frozen panes, filters, and formulas where they improve use.
3. Store dates as dates and numbers as numbers. Do not write formatted numeric strings when a numeric cell is correct.
4. Save the workbook in `/workspace` with a clear `.xlsx` filename.

## Edit

1. Open the staged upload with `openpyxl.load_workbook(path)`.
2. Make the smallest requested cell, row, column, sheet, formula, style, table, or chart change.
3. Save to a new output filename unless the user explicitly wants the original name replaced.
4. Do not save a workbook opened with `data_only=True`; doing so can replace formulas with cached values.
5. `openpyxl` writes formulas but does not calculate them. Preserve formulas and set calculation-on-load options when fresh results are needed.

## Verify

Reopen the output with `openpyxl.load_workbook`. Check sheet names, required cells, formulas, dimensions, and that the workbook contains visible data. Validate formula syntax and references by inspection because `openpyxl` does not calculate them.

Leave the finished `.xlsx` file in `/workspace`. `run_code` returns it as a download.
