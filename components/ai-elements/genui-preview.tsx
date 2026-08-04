"use client"

import { Renderer } from "@openuidev/react-lang"
import { openuiLibrary } from "@openuidev/react-ui"

import "@openuidev/react-ui/index.css"
import "@openuidev/react-ui/defaults.css"

// Renders an OpenUI Lang (genui) artifact with OpenUI's built-in component
// library. Lazy-loaded from the artifact card so the library only ships when a
// genui artifact is actually shown.
export function GenUiPreview({ content }: { content: string }) {
  return (
    <div className="max-h-[28rem] overflow-auto p-4">
      <Renderer
        library={openuiLibrary}
        response={content}
        isStreaming={false}
      />
    </div>
  )
}
