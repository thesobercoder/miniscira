import { defineEval } from "eve/evals"

const createRequests = [
  {
    skill: "pdf",
    prompt: "Create a one-page PDF invoice for a $120 design consultation.",
  },
  {
    skill: "docx",
    prompt: "Create a DOCX meeting agenda for a 30-minute product review.",
  },
  {
    skill: "pptx",
    prompt: "Create a three-slide PPTX pitch deck for a neighborhood bakery.",
  },
  {
    skill: "xlsx",
    prompt:
      "Create an XLSX monthly budget with rent, groceries, and transport rows.",
  },
] as const

export default defineEval({
  description:
    "Explicit document creation requests load the format skill and use the existing Python sandbox.",
  tags: ["document-generation", "routing"],
  async test(t) {
    for (const request of createRequests) {
      const session = t.newSession()
      await session.send(request.prompt)
      session.succeeded()
      session.loadedSkill(request.skill)
      session.calledTool("run_code")
      session.noFailedActions()
    }

    const edit = t.newSession()
    await edit.send(
      "Edit the uploaded quarterly-report.docx so the title says Q2 2026 Results, then return the updated DOCX."
    )
    edit.succeeded()
    edit.loadedSkill("docx")
    edit.calledTool("run_code")
    edit.noFailedActions()
  },
})
