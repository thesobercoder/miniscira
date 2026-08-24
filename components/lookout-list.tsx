"use client"

import { RiArrowDownSLine, RiFileTextLine, RiRadarLine } from "@remixicon/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"

export type LookoutListGroup = {
  id: string
  name: string
  reports: {
    id: string
    title: string
    timestamp: string
  }[]
}

export function LookoutList({ lookouts }: { lookouts: LookoutListGroup[] }) {
  const pathname = usePathname()

  if (lookouts.length === 0) return null

  return (
    <>
      <SidebarGroupLabel>Lookouts</SidebarGroupLabel>
      <SidebarMenu>
        {lookouts.map((lookout) => {
          return (
            <Collapsible
              key={lookout.id}
              defaultOpen={lookout.reports.length > 0}
              className="group/lookout"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger
                  render={<SidebarMenuButton tooltip={lookout.name} />}
                >
                  <RiRadarLine className="size-4 shrink-0" />
                  <span className="truncate">{lookout.name}</span>
                  <RiArrowDownSLine className="ml-auto size-4 shrink-0 transition-transform group-data-[panel-open]/lookout:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {lookout.reports.length === 0 ? (
                      <SidebarMenuSubItem>
                        <span className="block px-2 py-1 text-muted-foreground text-xs">
                          No reports yet
                        </span>
                      </SidebarMenuSubItem>
                    ) : (
                      lookout.reports.map((report) => (
                        <SidebarMenuSubItem key={report.id}>
                          <SidebarMenuSubButton
                            render={<Link href={`/chat/${report.id}`} />}
                            isActive={pathname === `/chat/${report.id}`}
                            title={`${report.title} · ${new Date(report.timestamp).toLocaleString()}`}
                          >
                            <RiFileTextLine className="size-3.5 shrink-0" />
                            <span className="truncate">{report.title}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))
                    )}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          )
        })}
      </SidebarMenu>
    </>
  )
}
