import { describe, expect, test } from "bun:test"

import { initialQuery, MAX_QUERY_LENGTH, safeRedirect } from "@/lib/urls"

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
