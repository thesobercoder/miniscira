import { RiAddLine } from "@remixicon/react"
import { desc, eq } from "drizzle-orm"
import Link from "next/link"
import { ChatList } from "@/components/chat-list"
import { SidebarNav } from "@/components/sidebar-nav"
import { SidebarUser } from "@/components/sidebar-user"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { db } from "@/lib/db"
import { chat } from "@/lib/db/schema"

type SidebarUserInfo = {
  id: string
  name: string
  email: string
  image?: string | null
}

export async function AppSidebar({ user }: { user: SidebarUserInfo }) {
  const chats = await db
    .select({ id: chat.id, title: chat.title, updatedAt: chat.updatedAt })
    .from(chat)
    .where(eq(chat.userId, user.id))
    .orderBy(desc(chat.updatedAt))

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
          // Renders an <a> via next/link, so opt out of native button semantics.
          nativeButton={false}
          render={<Link href="/" />}
          size="sm"
          // Icon rail: exact 32px circle; the glyph centers via mx-auto (see above).
          className="h-9 justify-start gap-2 rounded-lg transition-transform active:scale-[0.96] group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:rounded-full group-data-[collapsible=icon]:p-0!"
        >
          <RiAddLine className="size-4 shrink-0 group-data-[collapsible=icon]:mx-auto" />
          <span className="group-data-[collapsible=icon]:hidden">
            New research
          </span>
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarNav />
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <ChatList chats={chats} />
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
