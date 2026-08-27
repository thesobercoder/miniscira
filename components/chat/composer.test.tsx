import { describe, expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { Composer } from "@/components/chat/composer"

const noop = () => {}

describe("Composer", () => {
  test("autofocuses the research textarea when mounted", () => {
    const html = renderToStaticMarkup(
      createElement(Composer, {
        canceling: false,
        chatModel: "test-model",
        chatModelName: "Test model",
        documents: [],
        input: "",
        isBusy: false,
        mode: "search",
        modelPickerOpen: false,
        onInputChange: noop,
        onModeChange: noop,
        onModelPickerOpenChange: noop,
        onPickModel: noop,
        onRemoveDocument: noop,
        onRetryDocument: noop,
        onStop: noop,
        onSubmit: noop,
        onUpload: noop,
        uploading: false,
      })
    )

    const textarea = html.match(
      /<textarea[^>]*aria-label="Ask a research question"[^>]*>/
    )?.[0]

    expect(textarea).toBeDefined()
    expect(textarea).toContain('autofocus=""')
  })

  test("renders a camera input for taking photos", () => {
    const html = renderToStaticMarkup(
      createElement(Composer, {
        canceling: false,
        chatModel: "test-model",
        chatModelName: "Test model",
        documents: [],
        input: "",
        isBusy: false,
        mode: "search",
        modelPickerOpen: false,
        onInputChange: noop,
        onModeChange: noop,
        onModelPickerOpenChange: noop,
        onPickModel: noop,
        onRemoveDocument: noop,
        onRetryDocument: noop,
        onStop: noop,
        onSubmit: noop,
        onUpload: noop,
        uploading: false,
      })
    )

    expect(html).toContain('accept="image/*"')
    expect(html).toContain('capture="environment"')
  })
})
