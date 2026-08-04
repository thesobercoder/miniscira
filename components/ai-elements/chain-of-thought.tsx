"use client"

import { RiArrowDownSLine, RiBrainLine, RiCircleFill } from "@remixicon/react"
import type { ComponentProps, ComponentType, ReactNode } from "react"
import { createContext, memo, useContext, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useControllableState } from "@/hooks/use-controllable-state"
import { cn } from "@/lib/utils"

interface ChainOfThoughtContextValue {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue | null>(
  null
)

const useChainOfThought = () => {
  const context = useContext(ChainOfThoughtContext)
  if (!context) {
    throw new Error(
      "ChainOfThought components must be used within ChainOfThought"
    )
  }
  return context
}

export type ChainOfThoughtProps = ComponentProps<"div"> & {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

export const ChainOfThought = memo(
  ({
    className,
    open,
    defaultOpen = false,
    onOpenChange,
    children,
    ...props
  }: ChainOfThoughtProps) => {
    const [isOpen, setIsOpen] = useControllableState({
      defaultProp: defaultOpen,
      onChange: onOpenChange,
      prop: open,
    })

    const chainOfThoughtContext = useMemo(
      () => ({ isOpen, setIsOpen }),
      [isOpen, setIsOpen]
    )

    return (
      <ChainOfThoughtContext.Provider value={chainOfThoughtContext}>
        <div className={cn("not-prose w-full space-y-4", className)} {...props}>
          {children}
        </div>
      </ChainOfThoughtContext.Provider>
    )
  }
)

export type ChainOfThoughtHeaderProps = ComponentProps<
  typeof CollapsibleTrigger
> & {
  /** Replaces the default brain icon (e.g. a status indicator). */
  icon?: ReactNode
}

export const ChainOfThoughtHeader = memo(
  ({ className, icon, children, ...props }: ChainOfThoughtHeaderProps) => {
    const { isOpen, setIsOpen } = useChainOfThought()

    return (
      <Collapsible onOpenChange={setIsOpen} open={isOpen}>
        <CollapsibleTrigger
          className={cn(
            "flex w-full items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground",
            className
          )}
          {...props}
        >
          {icon ?? <RiBrainLine className="size-4" />}
          <span className="text-left">{children ?? "Chain of Thought"}</span>
          <RiArrowDownSLine
            className={cn(
              "size-4 shrink-0 opacity-50 transition-transform",
              // Points right when collapsed, rotates down when open.
              isOpen ? "rotate-0" : "-rotate-90"
            )}
          />
        </CollapsibleTrigger>
      </Collapsible>
    )
  }
)

export type ChainOfThoughtStepProps = Omit<
  ComponentProps<"div">,
  "onChange"
> & {
  icon?: ComponentType<{ className?: string }>
  /** Fully replaces the rendered icon (e.g. a live loader or status circle). */
  iconNode?: ReactNode
  label: ReactNode
  description?: ReactNode
  status?: "complete" | "active" | "pending"
  /** Omit the connector on the final step so the rail ends cleanly. */
  last?: boolean
  /** Force a step to be inert even though it has children, or vice versa. */
  collapsible?: boolean
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** Softer label for steps whose label *is* the content (e.g. reasoning). */
  labelMuted?: boolean
  /** prompt-kit's tell: the step icon becomes a chevron on hover. */
  swapIconOnHover?: boolean
}

const stepStatusStyles = {
  active: "text-foreground",
  complete: "text-muted-foreground",
  pending: "text-muted-foreground",
}

export const ChainOfThoughtStep = memo(
  ({
    className,
    icon: Icon = RiCircleFill,
    iconNode,
    label,
    description,
    status = "complete",
    last = false,
    collapsible,
    open,
    defaultOpen = false,
    onOpenChange,
    labelMuted = false,
    swapIconOnHover = true,
    children,
    ...props
  }: ChainOfThoughtStepProps) => {
    const [isOpen, setIsOpen] = useControllableState({
      defaultProp: defaultOpen,
      onChange: onOpenChange,
      prop: open,
    })

    const canCollapse = collapsible ?? Boolean(children)
    // Only swap in the chevron when there is something to reveal.
    const showChevron = canCollapse && swapIconOnHover

    return (
      <Collapsible
        className={cn(
          "relative text-sm",
          stepStatusStyles[status],
          "fade-in-0 slide-in-from-top-2 animate-in",
          className
        )}
        data-last={last}
        disabled={!canCollapse}
        onOpenChange={setIsOpen}
        open={canCollapse && isOpen}
        {...props}
      >
        <CollapsibleTrigger
          className={cn(
            "group/step flex w-full max-w-full items-start gap-2 text-left transition-colors",
            canCollapse && "cursor-pointer",
            labelMuted
              ? "text-muted-foreground hover:text-foreground"
              : "font-medium text-foreground hover:text-foreground/80"
          )}
        >
          <span className="relative mt-0.5 inline-flex size-4 shrink-0 items-center justify-center">
            <span
              className={cn(
                "inline-flex transition-opacity",
                showChevron && "group-hover/step:opacity-0"
              )}
            >
              {iconNode ?? <Icon className="size-4" />}
            </span>
            {showChevron && (
              <RiArrowDownSLine
                className={cn(
                  "absolute size-4 opacity-0 transition-all group-hover/step:opacity-100",
                  !isOpen && "-rotate-90"
                )}
              />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate">{label}</span>
        </CollapsibleTrigger>

        {/* Continuous rail: bridge the space-y gap down to the next step. */}
        {!last && (
          <div className="absolute top-6 -bottom-3 left-2 -mx-px w-px bg-border" />
        )}

        {/* No overflow-hidden on either box below. It was defensive, not
            load-bearing: the collapse animates opacity/translate, not height, so
            Radix doesn't need clipping here. Leaving it on prevented a nested
            timeline from drawing a connector back to this step's rail, since the
            rail sits at x=8 and the content box starts at x=24. Children that
            can be wide (code blocks, source lists) already clip themselves. */}
        <div className="min-w-0 space-y-2 pl-6">
          {description && (
            <div className="mt-2 text-muted-foreground text-xs">
              {description}
            </div>
          )}
          {/* `collapsible-height` animates the measured height (globals.css) so
              the timeline below reflows smoothly instead of jumping.

              That animation needs clipping — but NOT plain `overflow-hidden`.
              A nested timeline draws its elbow back to this step's rail at
              `-left-4`, i.e. outside this box (the rail sits at x=8, this
              content starts at x=24), and `overflow-hidden` cuts it off so the
              subagent branch appears to connect to nothing.

              `overflow-clip` + `overflow-clip-margin` is the pair that does
              both: the height still clips vertically, while up to 1.5rem of
              horizontal bleed is allowed through for the connector. A browser
              without `overflow-clip-margin` degrades to clipping at the edge —
              the elbow is hidden again, but nothing else breaks. */}
          <CollapsibleContent
            className={cn(
              "collapsible-height mt-2 space-y-2 overflow-clip outline-none [overflow-clip-margin:1.5rem]",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=open]:animate-in"
            )}
          >
            {children}
          </CollapsibleContent>
        </div>
      </Collapsible>
    )
  }
)

export type ChainOfThoughtSearchResultsProps = ComponentProps<"div">

export const ChainOfThoughtSearchResults = memo(
  ({ className, ...props }: ChainOfThoughtSearchResultsProps) => (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  )
)

export type ChainOfThoughtSearchResultProps = ComponentProps<typeof Badge>

export const ChainOfThoughtSearchResult = memo(
  ({ className, children, ...props }: ChainOfThoughtSearchResultProps) => (
    <Badge
      className={cn("gap-1 px-2 py-0.5 font-normal text-xs", className)}
      variant="secondary"
      {...props}
    >
      {children}
    </Badge>
  )
)

export type ChainOfThoughtContentProps = ComponentProps<
  typeof CollapsibleContent
>

export const ChainOfThoughtContent = memo(
  ({ className, children, ...props }: ChainOfThoughtContentProps) => {
    const { isOpen } = useChainOfThought()

    return (
      <Collapsible open={isOpen}>
        <CollapsibleContent
          className={cn(
            "mt-2 space-y-3",
            "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
            className
          )}
          {...props}
        >
          {children}
        </CollapsibleContent>
      </Collapsible>
    )
  }
)

type ChainOfThoughtImageProps = ComponentProps<"div"> & {
  caption?: string
}

/**
 * A captioned image tile for the chain-of-thought rail.
 *
 * @public Not wired up yet — this is the surface the image-generation step will
 * render into. Tagged so knip doesn't report it as an unused export.
 */
export const ChainOfThoughtImage = memo(
  ({ className, children, caption, ...props }: ChainOfThoughtImageProps) => (
    <div className={cn("mt-2 space-y-2", className)} {...props}>
      <div className="relative flex max-h-[22rem] items-center justify-center overflow-hidden rounded-lg bg-muted p-3">
        {children}
      </div>
      {caption && <p className="text-muted-foreground text-xs">{caption}</p>}
    </div>
  )
)

ChainOfThought.displayName = "ChainOfThought"
ChainOfThoughtHeader.displayName = "ChainOfThoughtHeader"
ChainOfThoughtStep.displayName = "ChainOfThoughtStep"
ChainOfThoughtSearchResults.displayName = "ChainOfThoughtSearchResults"
ChainOfThoughtSearchResult.displayName = "ChainOfThoughtSearchResult"
ChainOfThoughtContent.displayName = "ChainOfThoughtContent"
ChainOfThoughtImage.displayName = "ChainOfThoughtImage"
