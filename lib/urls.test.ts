import { describe, expect, test } from "bun:test"

import {
  initialQuery,
  MAX_QUERY_LENGTH,
  safeRedirect,
  signedInRedirect,
  withoutInitialQuery,
} from "@/lib/urls"

describe("initialQuery", () => {
  test("normalizes a single query", () => {
    expect(initialQuery(undefined)).toBe("")
    expect(initialQuery("")).toBe("")
    expect(initialQuery("   ")).toBe("")
    expect(initialQuery("  Who won the most oscars?  ")).toBe(
      "Who won the most oscars?"
    )
  })

  test("uses the first repeated value", () => {
    expect(initialQuery(["first", "second"])).toBe("first")
    expect(initialQuery([])).toBe("")
  })

  test("caps oversized queries", () => {
    expect(initialQuery("x".repeat(MAX_QUERY_LENGTH + 1))).toHaveLength(
      MAX_QUERY_LENGTH
    )
  })

  test("does not decode an already decoded value again", () => {
    expect(initialQuery("100%25 complete")).toBe("100%25 complete")
  })
})

describe("withoutInitialQuery", () => {
  test("removes every q value and preserves unrelated URL state", () => {
    expect(
      withoutInitialQuery(
        "https://app.example.com/?q=first&other=value&q=second#results"
      )
    ).toBe("/?other=value#results")
  })

  test("leaves URLs without q unchanged", () => {
    expect(
      withoutInitialQuery("https://app.example.com/chat/abc?tab=sources#2")
    ).toBe("/chat/abc?tab=sources#2")
  })
})

describe("safeRedirect", () => {
  test("keeps in-app paths", () => {
    expect(safeRedirect("/chat/abc")).toBe("/chat/abc")
    expect(safeRedirect("/projects?tab=docs")).toBe("/projects?tab=docs")
  })

  test("rejects absolute URLs", () => {
    expect(safeRedirect("https://evil.example.com")).toBe("/")
    expect(safeRedirect("http://evil.example.com/x")).toBe("/")
  })

  test("rejects protocol-relative URLs", () => {
    // The case a `startsWith("/")` check lets through.
    expect(safeRedirect("//evil.example.com")).toBe("/")
    expect(safeRedirect("//evil.example.com/path")).toBe("/")
  })

  test("rejects backslash variants", () => {
    expect(safeRedirect("/\\evil.example.com")).toBe("/")
    expect(safeRedirect("\\\\evil.example.com")).toBe("/")
  })

  test("rejects whitespace the URL parser strips before parsing", () => {
    // The bypass a prefix check misses entirely: tab/CR/LF are removed by the
    // WHATWG parser, so each of these becomes `//evil.example.com`.
    expect(safeRedirect("/\t/evil.example.com")).toBe("/")
    expect(safeRedirect("/\n/evil.example.com")).toBe("/")
    expect(safeRedirect("/\r/evil.example.com")).toBe("/")
    expect(safeRedirect("/\t\n\r/evil.example.com")).toBe("/")
  })

  test("what survives cannot re-enter the origin", () => {
    // Whatever is returned must resolve back onto our own origin.
    for (const candidate of [
      "/chat/abc",
      "/\t/evil.example.com",
      "//evil.example.com",
      "https://evil.example.com/x",
      "/ /evil.example.com",
    ]) {
      const out = safeRedirect(candidate)
      expect(new URL(out, "https://app.example.com").origin).toBe(
        "https://app.example.com"
      )
    }
  })

  test("rejects non-http schemes", () => {
    expect(safeRedirect("javascript:alert(1)")).toBe("/")
    expect(safeRedirect("data:text/html,<script>alert(1)</script>")).toBe("/")
  })

  test("falls back when absent", () => {
    expect(safeRedirect(null)).toBe("/")
    expect(safeRedirect(undefined)).toBe("/")
    expect(safeRedirect("")).toBe("/")
    expect(safeRedirect(null, "/chat")).toBe("/chat")
  })
})

describe("signedInRedirect", () => {
  test("keeps a safe return target", () => {
    expect(signedInRedirect("/chat/abc?tab=sources")).toBe(
      "/chat/abc?tab=sources"
    )
  })

  test("falls back to the app instead of looping through sign-in", () => {
    expect(signedInRedirect(null)).toBe("/")
    expect(signedInRedirect("/sign-in")).toBe("/")
    expect(signedInRedirect("/sign-in?redirect=/settings")).toBe("/")
  })
})
