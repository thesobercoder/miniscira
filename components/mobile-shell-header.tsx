"use client"

import Link from "next/link"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function MobileShellHeader() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background pt-[env(safe-area-inset-top)] md:hidden">
      <SidebarTrigger aria-label="Open navigation" className="size-11" />
      <Link
        href="/"
        className="font-[family-name:var(--font-be-vietnam-pro)] font-semibold text-lg tracking-tight"
      >
        miniscira
      </Link>
    </header>
  )
}
