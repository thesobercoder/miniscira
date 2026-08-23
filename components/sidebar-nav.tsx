"use client"

import { RiFolder3Line, RiPlugLine, RiRadarLine } from "@remixicon/react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

// Every destination in this nav group lives here. Add rows to this array —
// an inline <SidebarMenuItem> would silently miss the active state.
const NAV = [
  {
    href: "/projects",
    label: "Projects",
    icon: RiFolder3Line,
    tooltip: "Projects",
  },
  {
    href: "/lookouts",
    label: "Lookouts",
    icon: RiRadarLine,
    tooltip: "Lookouts",
  },
  {
    href: "/mcps",
    label: "MCP Servers",
    icon: RiPlugLine,
    tooltip: "MCP Servers",
  },
]

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <SidebarGroup className="py-1">
      <SidebarMenu>
        {NAV.map((item) => {
          const Icon = item.icon
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                render={<Link href={item.href} />}
                // The trailing slash keeps /mcps from matching /mcps-archive.
                isActive={
                  pathname === item.href || pathname.startsWith(`${item.href}/`)
                }
                tooltip={item.tooltip}
              >
                <Icon className="size-4 shrink-0" />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
