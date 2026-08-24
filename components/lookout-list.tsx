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
    timestamp: string
  }[]
}

const MAX_SIDEBAR_REPORTS = 10

function datedReportLabel(timestamp: string) {
  return new Date(timestamp).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  })
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
                      lookout.reports
                        .slice(0, MAX_SIDEBAR_REPORTS)
                        .map((report, index) => {
                          const label =
                            index === 0
                              ? "Current"
                              : datedReportLabel(report.timestamp)
                          return (
                            <SidebarMenuSubItem key={report.id}>
                              <SidebarMenuSubButton
                                render={<Link href={`/chat/${report.id}`} />}
                                isActive={pathname === `/chat/${report.id}`}
                                title={label}
                              >
                                <RiFileTextLine className="size-3.5 shrink-0" />
                                <span className="truncate">{label}</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          )
                        })
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
