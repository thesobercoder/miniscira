import { Accordion, Accordions } from "fumadocs-ui/components/accordion"
import { File, Files, Folder } from "fumadocs-ui/components/files"
import { Step, Steps } from "fumadocs-ui/components/steps"
import { Tab, Tabs } from "fumadocs-ui/components/tabs"
import defaultMdxComponents from "fumadocs-ui/mdx"
import type { MDXComponents } from "mdx/types"

/**
 * MDX components for the docs site.
 *
 * Deliberately separate from `components/markdown.tsx`, which renders *model*
 * output (streaming, citation pills, untrusted HTML). Docs are authored content
 * compiled at build time, so they use fumadocs' own set instead.
 *
 * `Card`, `Cards` and `Callout` come from the default set; the rest have to be
 * registered by hand before MDX can reference them.
 */
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    Accordion,
    Accordions,
    File,
    Files,
    Folder,
    Step,
    Steps,
    Tab,
    Tabs,
    ...components,
  }
}
