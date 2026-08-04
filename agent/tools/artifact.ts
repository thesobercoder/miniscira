import { defineTool } from "eve/tools"
import { z } from "zod"

// The model sees this tool as `artifact`. It's presentational: the model hands
// over one self-contained file and the UI renders it as an artifact card —
// live preview for html / markdown / svg / genui, syntax-highlighted code for
// everything else. It writes nothing to disk.
//
// `genui` is OpenUI Lang (openui.com). Load the `build_ui` skill for the syntax
// before writing one.
export default defineTool({
  description:
    "Create a single self-contained code/text file as an artifact the user can preview, copy, and download. Use it whenever you produce a complete deliverable file: a web page, a script, a config, a component, an SVG, a full Markdown document, or an interactive UI. Provide the whole file in `content` — never a fragment. Prefer this over a fenced code block for anything the user will save or run. `language` decides the preview: `html`, `markdown`, and `svg` render live; `genui` renders an interactive UI from OpenUI Lang (load the `build_ui` skill first); any other language shows highlighted code.",
  inputSchema: z.object({
    title: z
      .string()
      .min(1)
      .describe(
        'A short, human title for the artifact, e.g. "Landing page" or "fib.py".'
      ),
    language: z
      .string()
      .min(1)
      .describe(
        "The content's language/format, lowercase: html, markdown, svg, genui, css, javascript, typescript, tsx, jsx, python, json, yaml, sql, bash, go, rust, etc. Drives the preview."
      ),
    content: z
      .string()
      .min(1)
      .describe("The complete file contents. Never a fragment."),
  }),
  async execute({ title, language, content }) {
    return { title, language: language.toLowerCase(), content }
  },
})
