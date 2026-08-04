import {
  RiCheckLine,
  RiFileTextLine,
  RiSearchLine,
  RiSparkling2Line,
} from "@remixicon/react"

import { cn } from "@/lib/utils"

/**
 * The signature element: a research turn, playing itself once on load.
 *
 * The product's whole claim is that it shows its working, so the hero shows the
 * working rather than describing it. This is the real timeline idiom from
 * `components/timeline/` — same rail geometry (1px line at x=8, icons centred on
 * it), same muted-label treatment — reduced to a still life.
 *
 * Ordering carries information here, which is why this is numbered by position
 * and the feature list below is not: a research turn genuinely is a sequence,
 * and reading it top to bottom is the point.
 *
 * Pure CSS, no client component: it has to render on a deployment holding no
 * credentials. The blanket `prefers-reduced-motion` rule in globals.css
 * collapses every duration here to ~0, so the finished state is what a reader
 * who asked for no motion gets immediately.
 */

type Step = {
  icon: typeof RiSearchLine
  label: string
  detail: string
  /** Mono, because these are machine outputs, not prose. */
  meta?: string
}

const STEPS: Step[] = [
  {
    icon: RiSearchLine,
    label: "Searched the web",
    detail: "solid-state battery pilot lines 2026",
    meta: "8 sources",
  },
  {
    icon: RiFileTextLine,
    label: "Read 3 pages",
    detail: "nature.com · ieee.org · reuters.com",
  },
  {
    icon: RiSparkling2Line,
    label: "Noticed something",
    detail:
      "Two of the three “independent” figures trace back to the same press release.",
  },
]

export function LandingTimeline() {
  return (
    <div
      aria-hidden="true"
      className="rounded-2xl border border-input bg-card/60 p-5 shadow-sm backdrop-blur-sm"
    >
      <p className="mb-4 font-mono text-[0.7rem] text-muted-foreground uppercase tracking-widest">
        A turn, as it happens
      </p>

      <ol className="space-y-3">
        {STEPS.map((step, i) => (
          <li
            key={step.label}
            className="fade-in slide-in-from-bottom-1 relative animate-in pl-6 duration-500 ease-out-strong"
            style={{
              animationDelay: `${150 + i * 260}ms`,
              animationFillMode: "backwards",
            }}
          >
            {/* Rail, bridging the space-y gap down to the next step. */}
            <span className="absolute top-5 bottom-[-0.85rem] left-2 -mx-px w-px bg-border" />
            <step.icon className="absolute top-0.5 left-0 size-4 text-muted-foreground" />
            <p className="font-medium text-foreground text-sm">{step.label}</p>
            <p className="text-pretty text-muted-foreground text-sm leading-relaxed">
              {step.detail}
            </p>
            {step.meta && (
              <p className="mt-0.5 font-mono text-muted-foreground/70 text-xs">
                {step.meta}
              </p>
            )}
          </li>
        ))}

        {/* The answer closes the rail — no connector below it. */}
        <li
          className="fade-in slide-in-from-bottom-1 relative animate-in pl-6 duration-500 ease-out-strong"
          style={{ animationDelay: "930ms", animationFillMode: "backwards" }}
        >
          <RiCheckLine className="absolute top-0.5 left-0 size-4 text-primary-strong" />
          <p className="font-medium text-foreground text-sm">Answered</p>
          <p className="text-pretty text-muted-foreground text-sm leading-relaxed">
            Pilot capacity roughly tripled year over year
            <Citation>nature</Citation>
            <Citation>ieee</Citation>, though the widely quoted cost figure has
            one origin
            <Citation>reuters</Citation>.
          </p>
        </li>
      </ol>
    </div>
  )
}

/** The citation pill, matching what the real transcript renders. */
function Citation({ children }: { children: string }) {
  return (
    <span
      className={cn(
        "mx-0.5 inline-flex items-center rounded-full border border-input bg-muted",
        "px-1.5 py-px align-baseline font-mono text-[0.65rem] text-muted-foreground"
      )}
    >
      {children}
    </span>
  )
}
