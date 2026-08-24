import { RiAddLine } from "@remixicon/react"
import { desc, eq } from "drizzle-orm"
import Link from "next/link"
import { ChatList } from "@/components/chat-list"
import { LookoutList } from "@/components/lookout-list"
import { SidebarNav } from "@/components/sidebar-nav"
import { SidebarUser } from "@/components/sidebar-user"
import { ThreadSearchButton } from "@/components/thread-search"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { db } from "@/lib/db"
import { lookout } from "@/lib/db/schema"
import { listHistoryPage } from "@/lib/history"

type SidebarUserInfo = {
  id: string
  name: string
  email: string
  image?: string | null
}

export async function AppSidebar({ user }: { user: SidebarUserInfo }) {
  const [chatHistory, lookouts] = await Promise.all([
    listHistoryPage({ userId: user.id, scope: { kind: "active" } }),
    db
      .select({ id: lookout.id, name: lookout.name })
      .from(lookout)
      .where(eq(lookout.userId, user.id))
      .orderBy(desc(lookout.createdAt)),
  ])

  const lookoutGroups = await Promise.all(
    lookouts.map(async (item) => {
      const history = await listHistoryPage({
        userId: user.id,
        scope: { kind: "lookout-reports", lookoutId: item.id },
      })
      return {
        id: item.id,
        name: item.name,
        reports: history.rows
          .filter((report) => report.reportChatId !== null)
          .slice(0, 10)
          .map((report) => ({
            id: report.reportChatId as string,
            timestamp: report.timestamp.toISOString(),
          })),
      }
    })
  )

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-2">
        {/* Wordmark + the sidebar trigger live IN the sidebar. In the icon
            rail the wordmark hides and mx-auto centers the trigger — auto
            margins can't lose a CSS-order fight the way justify-* can. */}
        <div className="flex h-8 items-center">
          <Link
            href="/"
            className="px-1 font-[family-name:var(--font-be-vietnam-pro)] font-semibold text-lg tracking-tight group-data-[collapsible=icon]:hidden"
          >
            miniscira
          </Link>
          <SidebarTrigger className="ml-auto text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:mx-auto" />
        </div>
        <Button
          aria-keyshortcuts="Control+Shift+O Meta+Shift+O"
          nativeButton={false}
          render={<Link href="/" />}
          size="sm"
          // Icon rail: exact 32px circle; the glyph centers via mx-auto (see above).
          className="h-9 justify-start gap-2 rounded-lg transition-transform active:scale-[0.96] group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:rounded-full group-data-[collapsible=icon]:p-0!"
          title="New research (Ctrl/Cmd+Shift+O)"
        >
          <RiAddLine className="size-4 shrink-0 group-data-[collapsible=icon]:mx-auto" />
          <span className="group-data-[collapsible=icon]:hidden">
            New research
          </span>
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarNav />
        <SidebarMenu className="px-2">
          <SidebarMenuItem>
            <ThreadSearchButton />
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <LookoutList lookouts={lookoutGroups} />
        </SidebarGroup>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <ChatList
            initialPage={{
              chats: chatHistory.rows.map((row) => ({
                id: row.id,
                title: row.title,
                updatedAt: row.timestamp.toISOString(),
              })),
              nextCursor: chatHistory.nextCursor,
            }}
          />
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
