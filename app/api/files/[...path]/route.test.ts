import { afterEach, describe, expect, test } from "bun:test"
import crypto from "node:crypto"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

import { GET } from "./route"

const originalStorageDir = process.env.LOCAL_STORAGE_DIR
const temporaryDirectories: string[] = []

afterEach(async () => {
  process.env.LOCAL_STORAGE_DIR = originalStorageDir
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true }))
  )
})

async function storedFile(name: string) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "miniscira-files-"))
  temporaryDirectories.push(directory)
  process.env.LOCAL_STORAGE_DIR = directory
  await fs.writeFile(path.join(directory, name), "fixture")
}

async function putFile(name: string): Promise<URL> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "miniscira-files-"))
  temporaryDirectories.push(directory)
  process.env.LOCAL_STORAGE_DIR = directory
  const stored = `${crypto.randomUUID()}-${path.basename(name)}`
  await fs.writeFile(path.join(directory, stored), "fixture")
  return new URL(`http://localhost/api/files/${encodeURIComponent(stored)}`)
}

describe("file route", () => {
  test("serves office files as named attachments", async () => {
    const stored = await putFile("Quarterly report.docx")
    stored.searchParams.set("filename", "Quarterly report.docx")
    const response = await GET(new Request(stored), {
      params: Promise.resolve({
        path: [decodeURIComponent(stored.pathname.split("/").pop() ?? "")],
      }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="Quarterly report.docx"'
    )
  })

  test("keeps PDF and images inline", async () => {
    await storedFile("report.pdf")
    const pdf = await GET(
      new Request("http://localhost/api/files/report.pdf"),
      {
        params: Promise.resolve({ path: ["report.pdf"] }),
      }
    )
    expect(pdf.headers.get("content-type")).toBe("application/pdf")
    expect(pdf.headers.get("content-disposition")).toBeNull()

    await storedFile("chart.png")
    const image = await GET(
      new Request("http://localhost/api/files/chart.png"),
      {
        params: Promise.resolve({ path: ["chart.png"] }),
      }
    )
    expect(image.headers.get("content-type")).toBe("image/png")
    expect(image.headers.get("content-disposition")).toBeNull()
  })

  test("sanitizes the stored attachment filename", async () => {
    const stored = await putFile('bad"name.xlsx')
    stored.searchParams.set("filename", '../bad"\r\nname.xlsx')
    const response = await GET(new Request(stored), {
      params: Promise.resolve({
        path: [decodeURIComponent(stored.pathname.split("/").pop() ?? "")],
      }),
    })

    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="bad___name.xlsx"'
    )
  })
})
