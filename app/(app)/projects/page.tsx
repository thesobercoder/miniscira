import { desc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { ProjectsGrid } from "@/components/projects-grid"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { project } from "@/lib/db/schema"

export default async function ProjectsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const projects = await db
    .select({
      id: project.id,
      name: project.name,
      instructions: project.instructions,
    })
    .from(project)
    .where(eq(project.userId, session.user.id))
    .orderBy(desc(project.updatedAt))

  return (
    <div className="h-full overflow-y-auto">
      <ProjectsGrid initial={projects} />
    </div>
  )
}
