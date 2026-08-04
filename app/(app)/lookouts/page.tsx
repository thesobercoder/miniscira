import { desc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { LookoutsView } from "@/components/lookouts-view"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { lookout } from "@/lib/db/schema"

export default async function LookoutsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const rows = await db
    .select()
    .from(lookout)
    .where(eq(lookout.userId, session.user.id))
    .orderBy(desc(lookout.createdAt))

  const initial = rows.map((l) => ({
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
  }))

  return (
    <div className="h-full overflow-y-auto">
      <LookoutsView initial={initial} />
    </div>
  )
}
