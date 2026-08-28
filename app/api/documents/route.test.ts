import { beforeEach, describe, expect, mock, test } from "bun:test"
import { NextRequest } from "next/server"

const insertedValues: unknown[] = []
const updatedValues: unknown[] = []
const put = mock(
  async (
    pathname: string,
    _data: ArrayBuffer,
    options: { addRandomSuffix?: boolean; contentType?: string }
  ) => ({ url: `http://localhost/api/files/${pathname}`, ...options })
)

const db = {
  insert: mock(() => ({
    values: (values: unknown) => {
      insertedValues.push(values)
      return {
        returning: async () => [
          {
            id: "document-1",
            filename: (values as { filename: string }).filename,
            createdAt: new Date("2026-08-28T00:00:00.000Z"),
          },
        ],
      }
    },
  })),
  update: mock(() => ({
    set: (values: unknown) => {
      updatedValues.push(values)
      return { where: async () => undefined }
    },
  })),
}

mock.module("@/lib/api-auth", () => ({
  authed:
    (
      handler: (
        request: NextRequest,
        context: { userId: string }
      ) => Promise<Response>
    ) =>
    (request: NextRequest) =>
      handler(request, { userId: "user-1" }),
  notFound: () => Response.json({ error: "Not found" }, { status: 404 }),
}))
mock.module("@/lib/api-ownership", () => ({
  ownedChat: async () => ({ id: "chat-1" }),
  ownedProject: async () => ({ id: "project-1" }),
}))
mock.module("@/lib/db", () => ({ db }))
mock.module("@/lib/local-blob", () => ({ put }))

const { POST } = await import("./route")

function upload(file: File): NextRequest {
  const form = new FormData()
  form.set("file", file)
  return new NextRequest("http://localhost/api/documents", {
    method: "POST",
    body: form,
  })
}

beforeEach(() => {
  insertedValues.length = 0
  updatedValues.length = 0
  put.mockClear()
  db.insert.mockClear()
  db.update.mockClear()
})

describe("POST /api/documents", () => {
  test("rejects malformed claimed-image bytes before storage or persistence", async () => {
    const response = await POST(
      upload(new File(["not an image"], "camera.jpg", { type: "image/jpeg" }))
    )

    expect(response.status).toBe(415)
    expect(await response.json()).toEqual({
      error: "The uploaded file is not a supported image.",
    })
    expect(put).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
    expect(insertedValues).toEqual([])
  })

  test("stores valid mislabeled PNG bytes with the detected media type", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const response = await POST(
      upload(new File([png], "camera.jpg", { type: "image/jpeg" }))
    )

    expect(response.status).toBe(201)
    expect(put).toHaveBeenCalledTimes(1)
    expect(put.mock.calls[0]?.[2]).toEqual({
      addRandomSuffix: true,
      contentType: "image/png",
    })
    expect(insertedValues).toEqual([
      expect.objectContaining({
        kind: "image",
        mimeType: "image/png",
        status: "ready",
      }),
    ])
    expect(await response.json()).toEqual({
      document: expect.objectContaining({
        kind: "image",
        mimeType: "image/png",
        status: "ready",
      }),
    })
  })

  test("keeps the non-image document upload path unchanged", async () => {
    const response = await POST(
      upload(
        new File(["office package"], "report.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        })
      )
    )

    expect(response.status).toBe(201)
    expect(put.mock.calls[0]?.[2]).toEqual({
      addRandomSuffix: true,
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    })
    expect(insertedValues).toEqual([
      expect.objectContaining({
        kind: "document",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        status: "processing",
      }),
    ])
    expect(updatedValues).toEqual([{ status: "ready", chunkCount: 0 }])
    expect(await response.json()).toEqual({
      document: expect.objectContaining({
        kind: "document",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        status: "ready",
        chunkCount: 0,
      }),
    })
  })
})
