"use client"

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export const MESSAGE_ACTION_CLASS =
  "size-7 text-muted-foreground hover:bg-accent hover:text-foreground"

type MessageActionProps = {
  label: string
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
}

/** One visual and interaction contract for actions under every chat message. */
export function MessageAction({
  label,
  children,
  onClick,
  disabled,
  className,
}: MessageActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className={cn(MESSAGE_ACTION_CLASS, className)}
            disabled={disabled}
            onClick={onClick}
            size="icon-sm"
            type="button"
            variant="ghost"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
