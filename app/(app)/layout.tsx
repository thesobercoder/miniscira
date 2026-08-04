import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { SettingsProvider } from "@/components/settings-provider"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { auth } from "@/lib/auth"
import { getUserSettings } from "@/lib/user-settings"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"
  const settings = await getUserSettings(session.user.id)

  return (
    <SettingsProvider initial={settings}>
      <SidebarProvider defaultOpen={defaultOpen}>
        {/* ~58 focusables (nav + the whole chat history) sit before <main>,
            so this has to be the first thing in the tab order. */}
        <a
          href="#main-content"
          className="sr-only bg-background text-foreground ring-ring focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:px-3 focus:py-2 focus:font-medium focus:text-sm focus:shadow-md focus:ring-2"
        >
          Skip to content
        </a>
        <AppSidebar user={session.user} />
        <SidebarInset
          id="main-content"
          className="flex h-dvh flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </SettingsProvider>
  )
}
