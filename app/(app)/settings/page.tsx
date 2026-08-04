import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { ActivityGraph } from "@/components/activity-graph"
import { SettingsGatewayKey } from "@/components/settings-gateway-key"
import { SettingsMemories } from "@/components/settings-memories"
import { SettingsPersonalization } from "@/components/settings-personalization"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { auth } from "@/lib/auth"
import { getUserActivity } from "@/lib/user-activity"

function initialsOf(name: string, email: string) {
  return (
    name
      ?.split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || email[0]?.toUpperCase()
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="font-semibold text-foreground text-xl tabular-nums">
        {value}
      </div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  )
}

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const user = session.user
  const activity = await getUserActivity(user.id)
  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      })
    : null

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-10 px-4 py-10 md:px-6">
        <header>
          <h1 className="font-semibold text-2xl text-foreground tracking-tight">
            Settings
          </h1>
          <p className="text-muted-foreground text-sm">
            Your account, activity, and how MiniScira answers you.
          </p>
        </header>

        {/* Account */}
        <section className="space-y-4">
          <h2 className="font-semibold text-foreground text-sm">Account</h2>
          <div className="flex items-center gap-4 rounded-2xl border bg-card p-4">
            <Avatar size="lg" className="size-14">
              {user.image && <AvatarImage src={user.image} alt={user.name} />}
              <AvatarFallback className="text-base">
                {initialsOf(user.name, user.email)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate font-medium text-foreground">
                {user.name}
              </div>
              <div className="truncate text-muted-foreground text-sm">
                {user.email}
              </div>
              {memberSince && (
                <div className="mt-0.5 text-muted-foreground text-xs">
                  Member since {memberSince}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Activity */}
        <section className="space-y-4">
          <h2 className="font-semibold text-foreground text-sm">Activity</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Stat label="Messages" value={activity.totalMessages} />
            <Stat label="Chats" value={activity.totalChats} />
            <Stat label="Active days" value={activity.activeDays} />
            <Stat label="Current streak" value={`${activity.currentStreak}d`} />
          </div>
          <div className="rounded-2xl border bg-card p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-muted-foreground text-xs">
                Messages over the last year
              </span>
              {activity.busiestDay && (
                <span className="text-muted-foreground text-xs">
                  Busiest: {activity.busiestDay.count} on{" "}
                  {activity.busiestDay.date}
                </span>
              )}
            </div>
            <ActivityGraph activity={activity} />
          </div>
        </section>

        <Separator />

        {/* Billing credential. First after the account block on purpose: with
            no key saved, nothing else on this page has any effect. */}
        <SettingsGatewayKey />

        <Separator />

        {/* Personalization */}
        <section>
          <SettingsPersonalization />
        </section>

        <Separator />

        {/* Memories */}
        <section>
          <SettingsMemories />
        </section>
      </div>
    </div>
  )
}
