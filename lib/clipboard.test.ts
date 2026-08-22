import { afterEach, describe, expect, mock, test } from "bun:test"

import { copyText } from "./clipboard"

const originalNavigator = globalThis.navigator
const originalDocument = globalThis.document

afterEach(() => {
  if (originalNavigator) globalThis.navigator = originalNavigator
  else Reflect.deleteProperty(globalThis, "navigator")
  if (originalDocument) globalThis.document = originalDocument
  else Reflect.deleteProperty(globalThis, "document")
})

describe("copyText", () => {
  test("uses the async Clipboard API when available", async () => {
    const writeText = mock(async () => {})
    globalThis.navigator = { clipboard: { writeText } } as unknown as Navigator

    expect(await copyText("hello")).toBe(true)
    expect(writeText).toHaveBeenCalledWith("hello")
  })

  test("falls back when Clipboard API access is rejected", async () => {
    globalThis.navigator = {
      clipboard: {
        writeText: mock(async () => Promise.reject(new Error("denied"))),
      },
    } as unknown as Navigator
    const select = mock(() => {})
    const remove = mock(() => {})
    const append = mock(() => {})
    const execCommand = mock(() => true)
    globalThis.document = {
      createElement: mock(() => ({
        value: "",
        style: {},
        setAttribute: mock(() => {}),
        select,
        setSelectionRange: mock(() => {}),
        remove,
      })),
      body: { append },
      execCommand,
    } as unknown as Document

    expect(await copyText("fallback")).toBe(true)
    expect(append).toHaveBeenCalledTimes(1)
    expect(select).toHaveBeenCalledTimes(1)
    expect(execCommand).toHaveBeenCalledWith("copy")
    expect(remove).toHaveBeenCalledTimes(1)
  })

  test("reports failure when neither copy path succeeds", async () => {
    globalThis.navigator = {} as Navigator
    globalThis.document = {
      createElement: mock(() => ({
        value: "",
        style: {},
        setAttribute: mock(() => {}),
        select: mock(() => {}),
        setSelectionRange: mock(() => {}),
        remove: mock(() => {}),
      })),
      body: { append: mock(() => {}) },
      execCommand: mock(() => false),
    } as unknown as Document

    expect(await copyText("nope")).toBe(false)
  })
})
