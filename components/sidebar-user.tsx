"use client"

import {
  RiComputerLine,
  RiExpandUpDownLine,
  RiLogoutBoxRLine,
  RiMoonLine,
  RiSettings3Line,
  RiSunLine,
} from "@remixicon/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useSyncExternalStore } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

type UserInfo = { name: string; email: string; image?: string | null }

const THEMES = [
  { value: "light", label: "Light", icon: RiSunLine },
  { value: "dark", label: "Dark", icon: RiMoonLine },
  { value: "system", label: "System", icon: RiComputerLine },
] as const

// Never emits — the store's only job is "server false, client true".
const subscribeNoop = () => () => {}

function initialsOf(user: UserInfo) {
  return (
    user.name
      ?.split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || user.email[0]?.toUpperCase()
  )
}

/**
 * Three explicit choices instead of a "Toggle theme" row: that label never said
 * what it would become, and it left "System" unreachable. A radio group keeps
 * roving focus and announces the checked state; preventDefault on select keeps
 * the menu open so the change is visible without reopening it.
 *
 * Laid out as one row — label left, segments right — because a stacked section
 * with its own heading spent about ninety pixels on a setting most people touch
 * once. The segments are icon-only, so each carries its label as its
 * accessible name and its tooltip.
 */
function ThemeControl() {
  const { theme, setTheme } = useTheme()
  // `theme` is undefined until the client reads storage — leave the row
  // unselected for one paint rather than flashing the wrong active segment.
  // useSyncExternalStore (not setState-in-effect) keeps hydration clean.
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  )

  return (
    <div className="flex items-center justify-between gap-2 py-1 pr-1 pl-2">
      <span className="text-muted-foreground text-xs">Theme</span>
      <DropdownMenuRadioGroup
        value={mounted ? theme : undefined}
        onValueChange={setTheme}
        className="flex gap-0.5 rounded-lg bg-muted/60 p-0.5"
      >
        {THEMES.map(({ value, label, icon: Icon }) => (
          <DropdownMenuRadioItem
            key={value}
            value={value}
            aria-label={label}
            title={label}
            onSelect={(e) => e.preventDefault()}
            className={cn(
              "size-6 justify-center rounded-md p-0 pr-0 pl-0 transition-colors",
              "[&>[data-slot=dropdown-menu-radio-item-indicator]]:hidden",
              "data-[state=checked]:bg-background data-[state=checked]:text-foreground data-[state=checked]:shadow-xs",
              "data-[state=unchecked]:text-muted-foreground"
            )}
          >
            <Icon className="size-3.5" />
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </div>
  )
}

export function SidebarUser({ user }: { user: UserInfo }) {
  const router = useRouter()
  const { state: sidebarState } = useSidebar()
  const collapsed = sidebarState === "collapsed"
  const initials = initialsOf(user)

  async function signOut() {
    await authClient.signOut()
    router.push("/sign-in")
    router.refresh()
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          {/* The two branches render different children, so the whole element
              goes into `render` and the trigger takes none of its own. */}
          <DropdownMenuTrigger
            render={
              collapsed ? (
                // Icon rail: a plain centered avatar button. The SidebarMenuButton
                // primitives carry conflicting p-2!/p-0! icon-mode paddings whose
                // winner depends on CSS order — a bare button is deterministic.
                <button
                  type="button"
                  aria-label={`${user.name} — account menu`}
                  className="mx-auto flex size-8 items-center justify-center rounded-full outline-none ring-sidebar-ring transition-[background-color,scale] hover:bg-sidebar-accent focus-visible:ring-2 active:scale-[0.96]"
                >
                  <Avatar size="sm" className="ring-1 ring-border/60">
                    {user.image && <AvatarImage src={user.image} alt="" />}
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                </button>
              ) : (
                <button
                  type="button"
                  aria-label={`${user.name} — account menu`}
                  className="flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left outline-none ring-sidebar-ring transition-[background-color,scale] hover:bg-sidebar-accent focus-visible:ring-2 active:scale-[0.96] aria-expanded:bg-sidebar-accent"
                >
                  <Avatar size="sm" className="shrink-0 ring-1 ring-border/60">
                    {user.image && <AvatarImage src={user.image} alt="" />}
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  {/* Name only. The email lives in the menu header, which is the
                    one place that has to answer "which account is this?" — on
                    the trigger it only repeated what the menu already said, at
                    the cost of the tallest, widest element in the sidebar. */}
                  <span className="min-w-0 flex-1 truncate font-medium text-sm">
                    {user.name}
                  </span>
                  <RiExpandUpDownLine className="size-4 shrink-0 text-muted-foreground" />
                </button>
              )
            }
          />

          {/* One separator, not three. The header is identity, everything below
              it is actions — that's the only division worth drawing. */}
          <DropdownMenuContent side="top" align="start" className="w-60 p-1">
            <div className="flex min-w-0 items-center gap-2.5 px-1.5 pt-1.5 pb-2">
              <Avatar size="sm" className="shrink-0 ring-1 ring-border/60">
                {user.image && <AvatarImage src={user.image} alt="" />}
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-sm">
                  {user.name}
                </span>
                <span
                  title={user.email}
                  className="truncate text-muted-foreground text-xs"
                >
                  {user.email}
                </span>
              </span>
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuItem render={<Link href="/settings" />}>
              <RiSettings3Line />
              Settings
            </DropdownMenuItem>

            <ThemeControl />

            <DropdownMenuItem variant="destructive" onClick={signOut}>
              <RiLogoutBoxRLine />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
