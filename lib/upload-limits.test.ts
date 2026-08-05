import { describe, expect, test } from "bun:test"

import { isOwnedUploadPath, uploadPathname } from "@/lib/upload-limits"

const OWNER = "user_abc123"
const OTHER = "user_xyz789"

describe("uploadPathname", () => {
  test("puts the file under the owner's prefix", () => {
    expect(uploadPathname(OWNER, "report.pdf")).toBe(
      "documents/user_abc123/report.pdf"
    )
  })

  test("flattens path separators so a name cannot climb out of the prefix", () => {
    // Both separators, because the name comes from the client and Windows
    // browsers are not the only thing that can put a backslash in one.
    expect(uploadPathname(OWNER, "../../etc/passwd")).toBe(
      "documents/user_abc123/.._.._etc_passwd"
    )
    expect(uploadPathname(OWNER, "a\\b\\c.pdf")).toBe(
      "documents/user_abc123/a_b_c.pdf"
    )
  })

  test("falls back to a name when the file has none", () => {
    expect(uploadPathname(OWNER, "")).toBe("documents/user_abc123/upload")
  })

  test("produces a path its own ownership check accepts", () => {
    // The two halves have to agree: a path this builds is a path the metadata
    // route must be willing to trust.
    expect(isOwnedUploadPath(uploadPathname(OWNER, "report.pdf"), OWNER)).toBe(
      true
    )
  })
})

describe("isOwnedUploadPath", () => {
  test("accepts the owner's own file", () => {
    expect(isOwnedUploadPath("documents/user_abc123/report.pdf", OWNER)).toBe(
      true
    )
  })

  test("accepts the random suffix the store appends", () => {
    expect(
      isOwnedUploadPath("documents/user_abc123/report-Xy7bQ2.pdf", OWNER)
    ).toBe(true)
  })

  test("rejects another user's file", () => {
    // The whole point: this is what stops a caller posting someone else's blob
    // URL and reading their document back through the model.
    expect(isOwnedUploadPath("documents/user_xyz789/report.pdf", OWNER)).toBe(
      false
    )
    expect(isOwnedUploadPath("documents/user_abc123/report.pdf", OTHER)).toBe(
      false
    )
  })

  test("rejects an id that merely starts with the owner's", () => {
    // Without the trailing slash in the prefix, "user_abc1234" would pass as
    // "user_abc123".
    expect(isOwnedUploadPath("documents/user_abc1234/report.pdf", OWNER)).toBe(
      false
    )
  })

  test("rejects anything nested below the prefix", () => {
    // A deeper path is how a traversal would hide, so the leaf must be a leaf.
    expect(
      isOwnedUploadPath("documents/user_abc123/sub/report.pdf", OWNER)
    ).toBe(false)
    expect(
      isOwnedUploadPath(
        "documents/user_abc123/../user_xyz789/report.pdf",
        OWNER
      )
    ).toBe(false)
  })

  test("rejects paths outside the documents prefix entirely", () => {
    expect(isOwnedUploadPath("user_abc123/report.pdf", OWNER)).toBe(false)
    expect(isOwnedUploadPath("", OWNER)).toBe(false)
  })
})
