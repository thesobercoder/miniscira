import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { ProjectView } from "@/components/project-view"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { project } from "@/lib/db/schema"

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const [row] = await db
    .select()
    .from(project)
    .where(eq(project.id, id))
    .limit(1)
  if (!row) notFound()
  if (row.userId !== session.user.id) redirect("/projects")

  return (
    <ProjectView
      key={id}
      projectId={id}
      initialName={row.name}
      initialInstructions={row.instructions ?? ""}
      initialLinks={row.links ?? []}
    />
  )
}
