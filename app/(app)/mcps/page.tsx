import { desc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { McpView } from "@/components/mcp-view"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { mcpServer } from "@/lib/db/schema"
import { publicServer } from "@/lib/mcp"

export default async function McpsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const rows = await db
    .select()
    .from(mcpServer)
    .where(eq(mcpServer.userId, session.user.id))
    .orderBy(desc(mcpServer.createdAt))

  const initial = rows.map((s) => publicServer(s))

  return (
    <div className="h-full overflow-y-auto">
      <McpView initial={initial} />
    </div>
  )
}
