import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { NewResearchLink } from "./new-research-link"

describe("NewResearchLink", () => {
  test("renders a native document navigation to a fresh research page", () => {
    expect(
      renderToStaticMarkup(<NewResearchLink aria-label="New research" />)
    ).toBe('<a href="/" aria-label="New research"></a>')
  })
})
