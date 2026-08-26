import { writeFileSync } from "node:fs"
import { defineEval } from "eve/evals"
import { satisfies } from "eve/evals/expect"

const formats = [
  {
    extension: "pdf",
    mediaType: "application/pdf",
    prompt:
      "Create a tiny PDF named miniscira-production-proof.pdf containing the exact text MiniScira production proof. Use the PDF skill and return the file.",
  },
  {
    extension: "docx",
    mediaType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    prompt:
      "Create a tiny DOCX named miniscira-production-proof.docx containing the exact text MiniScira production proof. Use the DOCX skill and return the file.",
  },
  {
    extension: "pptx",
    mediaType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    prompt:
      "Create a one-slide PPTX named miniscira-production-proof.pptx with title MiniScira production proof. Use the PPTX skill and return the file.",
  },
  {
    extension: "xlsx",
    mediaType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    prompt:
      "Create a tiny XLSX named miniscira-production-proof.xlsx with cell A1 equal to MiniScira production proof. Use the XLSX skill and return the file.",
  },
] as const

export default defineEval({
  timeoutMs: 12 * 60_000,
  async test(t) {
    const verifiedPaths: string[] = []
    for (const format of formats) {
      const turn = await t.send(format.prompt)
      turn.expectOk()
      turn.loadedSkill(format.extension).gate()
      const runCode = turn.requireToolCall("run_code")
      const files = Array.isArray(
        (runCode.output as { files?: unknown })?.files
      )
        ? ((runCode.output as { files: unknown[] }).files as Array<{
            name?: string
            url?: string
            mediaType?: string
          }>)
        : []
      const file = files.find(
        (candidate) =>
          candidate.name?.endsWith(`.${format.extension}`) &&
          candidate.mediaType === format.mediaType &&
          typeof candidate.url === "string"
      )
      await t.require(
        file,
        satisfies(
          (value) => Boolean(value),
          `${format.extension} run_code output contains expected file metadata`
        )
      )
      if (!file?.url) {
        continue
      }
      const filePath = new URL(file.url, t.target.url).pathname
      verifiedPaths.push(filePath)
      const response = await fetch(new URL(filePath, t.target.url))
      await t.require(
        response.status,
        satisfies<number>(
          (status) => status >= 200 && status < 300,
          `${format.extension} download succeeds`
        )
      )
      await t.require(
        response.headers.get("content-type")?.split(";")[0],
        satisfies<string | undefined>(
          (mediaType) => mediaType === format.mediaType,
          `${format.extension} download has the expected MIME type`
        )
      )
      await t.require(
        (await response.arrayBuffer()).byteLength,
        satisfies<number>(
          (size) => size > 0,
          `${format.extension} download contains bytes`
        )
      )
    }

    const editTurn = await t.sendFile(
      "Edit the attached DOCX. Replace the text Original production edit fixture with Edited by MiniScira production. Save it as miniscira-production-edited.docx and return the edited file.",
      "evals/fixtures/document-edit-source.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    editTurn.expectOk()
    editTurn.loadedSkill("docx").gate()
    const editRunCodes = editTurn.toolCalls.filter(
      (call) => call.name === "run_code"
    )
    const editRunCode = editRunCodes.find((call) =>
      Array.isArray((call.input as { files?: unknown }).files)
    )
    await t.require(
      editRunCode,
      satisfies(
        (call) => Boolean(call),
        "edit turn calls run_code with the uploaded DOCX"
      )
    )
    await t.require(
      (editRunCode?.input as { files?: unknown } | undefined)?.files,
      satisfies<unknown>(
        (files) =>
          Array.isArray(files) &&
          files.some(
            (file) =>
              typeof file === "string" &&
              (file === "document-edit-source.docx" ||
                file.endsWith("/document-edit-source.docx"))
          ),
        "run_code stages the uploaded DOCX by filename"
      )
    )
    const editedFiles = editRunCodes.flatMap((call) => {
      const files = (call.output as { files?: unknown } | undefined)?.files
      return Array.isArray(files)
        ? (files as Array<{
            name?: string
            url?: string
            mediaType?: string
          }>)
        : []
    })
    const editedFile = editedFiles.find(
      (candidate) =>
        candidate.name === "miniscira-production-edited.docx" &&
        candidate.mediaType === formats[1].mediaType &&
        typeof candidate.url === "string"
    )
    await t.require(
      editedFile,
      satisfies(
        (value) => Boolean(value),
        "edited DOCX appears in run_code output"
      )
    )
    if (editedFile?.url) {
      const path = new URL(editedFile.url, t.target.url).pathname
      verifiedPaths.push(path)
      const response = await fetch(new URL(path, t.target.url))
      await t.require(
        response.status,
        satisfies<number>(
          (status) => status >= 200 && status < 300,
          "edited DOCX download succeeds"
        )
      )
      await t.require(
        (await response.arrayBuffer()).byteLength,
        satisfies<number>(
          (size) => size > 0,
          "edited DOCX download contains bytes"
        )
      )
    }
    writeFileSync(
      ".eve/document-files-production-proof.json",
      JSON.stringify(verifiedPaths)
    )
  },
})
