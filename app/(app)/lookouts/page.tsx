import { desc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { LookoutsView } from "@/components/lookouts-view"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { lookout } from "@/lib/db/schema"
import { listHistoryPage } from "@/lib/history"

export default async function LookoutsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const rows = await db
    .select()
    .from(lookout)
    .where(eq(lookout.userId, session.user.id))
    .orderBy(desc(lookout.createdAt))

  const initial = await Promise.all(
    rows.map(async (l) => {
      const history = await listHistoryPage({
        userId: session.user.id,
        scope: { kind: "lookout-reports", lookoutId: l.id },
      })
      return {
        id: l.id,
        name: l.name,
        prompt: l.prompt,
        cron: l.cron,
        runAt: l.runAt ? l.runAt.toISOString() : null,
        frequency: l.frequency,
        timezone: l.timezone,
        status: l.status,
        nextRunAt: l.nextRunAt ? l.nextRunAt.toISOString() : null,
        lastRunAt: l.lastRunAt ? l.lastRunAt.toISOString() : null,
        reports: history.rows.map((report) => ({
          id: report.id,
          title: report.title,
          timestamp: report.timestamp.toISOString(),
          reportChatId: report.reportChatId,
          status: report.lookoutRunStatus,
          incomplete: report.incomplete,
        })),
      }
    })
  )

  return (
    <div className="h-full overflow-y-auto">
      <LookoutsView initial={initial} />
    </div>
  )
}
