import { describe, expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { TurnStatusNote } from "@/components/turn-status"
import { EMPTY_ANNOTATION } from "@/lib/turn-annotations"

describe("TurnStatusNote", () => {
  test("shows friendly copy for image decode failures", () => {
    const html = renderToStaticMarkup(
      createElement(TurnStatusNote, {
        annotation: {
          ...EMPTY_ANNOTATION,
          failure: {
            code: "1210",
            message: "图片输入格式/解析错误",
          },
        },
        hasAttachments: true,
        streaming: false,
      })
    )

    expect(html).toContain(
      "Your model couldn&#x27;t process your photo this time. Try sending again."
    )
    expect(html).toContain("图片输入格式/解析错误")
    expect(html).toContain("1210")
  })

  test("keeps raw copy for failures without images", () => {
    const html = renderToStaticMarkup(
      createElement(TurnStatusNote, {
        annotation: {
          ...EMPTY_ANNOTATION,
          failure: {
            code: "1210",
            message: "Provider failure",
          },
        },
        streaming: false,
      })
    )

    expect(html).toContain("Provider failure")
    expect(html).not.toContain("couldn&#x27;t process your photo")
  })
})
