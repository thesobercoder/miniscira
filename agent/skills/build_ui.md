---
description: Use when the user asks you to build an interactive interface (a dashboard, form, chart, data table, calculator, or any GenUI/"live" UI). Teaches OpenUI Lang, which you write into an `artifact` with language `genui`.
---

# Build an interactive UI (GenUI)

When the user wants an interactive interface (a dashboard, form, chart, table,
calculator, or similar), build it as a **genui artifact**: call the `artifact`
tool with `language: "genui"` and put valid **OpenUI Lang** in `content`. The UI
renders live from OpenUI's component library.

Rules for the artifact:

- `content` is OpenUI Lang **only**: no markdown, no prose, no code fences.
- Pick a clear `title` (e.g. "Sales dashboard").
- For a static page, script, or document, use a normal language (`html`,
  `markdown`, `python`, …) instead. genui is for interactive component UIs.

Write the answer prose (if any) as normal text before or after the artifact. It
stays outside the OpenUI Lang content.

---

You write OpenUI Lang, a declarative UI language. The artifact `content` must be valid openui-lang code: no markdown, no explanations, just openui-lang.

## Syntax rules

1. Each statement is on its own line: `identifier = Expression`
2. `root` is the entry point: every program must define `root = Stack(...)`
3. Expressions are: strings ("..."), numbers, booleans (true/false), null, arrays ([...]), objects ({...}), or component calls TypeName(arg1, arg2, ...)
4. Use references for readability: define `name = ...` on one line, then use `name` later
5. EVERY variable (except root) MUST be referenced by at least one other variable. Unreferenced variables are silently dropped and will NOT render. Always include defined variables in their parent's children/items array.
6. Arguments are POSITIONAL (order matters, not names). Write `Stack([children], "row", "l")` NOT `Stack([children], direction: "row", gap: "l")`. Colon syntax is NOT supported and silently breaks
7. Optional arguments can be omitted from the end
- Strings use double quotes with backslash escaping

## Component signatures

Arguments marked with ? are optional. Sub-components can be inline or referenced; prefer references for better streaming.

### Layout
- `Stack([children], direction?, gap?, align?, justify?, wrap?)` — Flex container. direction: "row"|"column" (default "column"). gap: "none"|"xs"|"s"|"m"|"l"|"xl"|"2xl" (default "m"). align: "start"|"center"|"end"|"stretch"|"baseline". justify: "start"|"center"|"end"|"between"|"around"|"evenly".
- `Tabs([TabItem(...)])` — Tabbed container. `TabItem(value, trigger, [content])` — value is unique id, trigger is tab label, content is array of components.
- `Accordion([AccordionItem(...)])` — Collapsible sections. `AccordionItem(value, trigger, [content])` — value is unique id, trigger is section title.
- `Steps([Step(title, details)])` — Step-by-step guide.
- `Carousel([children])` — Horizontal scrollable carousel.
- `Divider()` — Visual divider between content sections.
- `Modal(title, $open, [children])` — Modal dialog. $open is a reactive $boolean binding; set it to true to open, and X/Escape/backdrop auto-closes. Put Form with buttons inside children.
- For grid-like layouts, use Stack with direction "row" and wrap set to true.
- Prefer justify "start" (or omit justify) with wrap=true for stable columns instead of uneven gutters.
- Use nested Stacks when you need explicit rows/sections.
- Show/hide sections: $editId != "" ? Card([editForm]) : null
- Use Tabs for alternative views (chart types, data sections); no $variable needed.

### Content
- `Card([children], variant?)` — Styled container. variant: "card" (default, elevated) | "sunk" (recessed) | "clear" (transparent). Always full width. Accepts all Stack flex params.
- `CardHeader(title?, subtitle?)` — Header with optional title and subtitle.
- `TextContent(text, size?)` — Text block. Supports markdown. size: "small" | "default" | "large" | "small-heavy" | "large-heavy".
- `Callout(variant, title, description, $visible?)` — Callout banner. $visible is a reactive $boolean — auto-dismisses after 3s.
- `Image(url, alt)` — Image with alt text.
- `Code(text, language?)` — Syntax-highlighted code block.
- KPI card: `Card([TextContent("Label", "small"), TextContent("" + @Count(@Filter(data.rows, "field", "==", "value")), "large-heavy")])`

### Tables
- `Table([Col(...)])` — Data table, COLUMN-oriented. `Col(label, dataArray, type?)`.
- Use array pluck for data: `data.rows.fieldName`. Example: `Table([Col("Label", data.rows.name), Col("Count", data.rows.count, "number")])`.
- Styled cells: `Col("Status", @Each(data.rows, "item", Tag(item.status, null, "sm", item.status == "open" ? "success" : "danger")))`.
- Row actions: `Col("Actions", @Each(data.rows, "t", Button("Edit", Action([@Set($showEdit, true), @Set($editId, t.id)]))))`.
- Sortable: `sorted = @Sort(data.rows, $sortField, "desc")`. Searchable: `filtered = @Filter(data.rows, "title", "contains", $search)`.
- Empty state: `@Count(data.rows) > 0 ? Table([...]) : TextContent("No data yet")`.

### Charts (2D)
- `BarChart(labels, [Series(...)])`, `LineChart(...)`, `AreaChart(...)`, `RadarChart(...)`, `HorizontalBarChart(...)`. `Series(name, values)`.
- Charts accept column arrays: `LineChart(data.rows.day, [Series("Views", data.rows.views)])`.
- Wrap charts in Cards with CardHeader for titled sections. Use Tabs for multiple chart views.

### Charts (1D)
- `PieChart(categories, values, variant?)`, `RadialChart(...)`, `SingleStackedBarChart(...)`. These need NUMBERS, not objects.
- Aggregate list data: `PieChart(["Low","Med","High"], [@Count(@Filter(data.rows,"priority","==","low")), @Count(@Filter(data.rows,"priority","==","medium")), @Count(@Filter(data.rows,"priority","==","high"))], "donut")`.

### Forms
- `Form(id, Buttons([...]), [FormControl(...)])` — Form container. Requires explicit buttons as the third arg.
- `FormControl(label, inputComponent, hint?, rules?)` — Field. Define EACH FormControl as its own reference for progressive streaming. NEVER nest Form inside Form.
- rules is optional: `{required: true, email: true, minLength: 8}`. Available: required, email, min, max, minLength, maxLength, pattern, url, numeric. The renderer shows error messages automatically, so do NOT generate error text.
- Inputs: `Input($binding, placeholder?)`, `Select($binding, [Option(value, label)])`, `Slider($binding, min, max, step?)`, `Switches([Switch(...)])`.

### Buttons and data display
- `Button(label, Action([...]))` — Clickable button. `Buttons([Button(...)], direction?)` — group.
- `Tags([strings])`, `Tag(value, icon?, size?, variant?)` — styled badge. Color-mapped: `Tag(value, null, "sm", value == "high" ? "danger" : "neutral")`.

## Hoisting and streaming (CRITICAL)

openui-lang supports hoisting: a reference can be used BEFORE it is defined; the parser resolves references after the full input is parsed.

**Recommended statement order:**
1. `root = Stack(...)` — UI shell appears immediately.
2. Component definitions, filled in as they stream.
3. Data values, leaf content last.

## Important rules
- When asked about data, generate realistic/plausible data.
- Choose components that best represent the content (tables for comparisons, charts for trends, forms for input).

## Final verification
1. `root = Stack(...)` is the FIRST line.
2. Every referenced name is defined, and every defined name (other than root) is reachable from root.
