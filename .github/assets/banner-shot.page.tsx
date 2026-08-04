"use client"

// TEMPORARY — render target for .github/assets/banner.png (1200×600) and
// app/opengraph-image.png (1200×630). Sized to the viewport so one page serves
// both; the shot's --window-size decides which. Delete after shooting.
import { RiGlobeLine, RiFileTextLine } from "@remixicon/react"

import {
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought"
import { Live, QueryBadges, ResultList } from "@/components/timeline/primitives"

export default function BannerShot() {
  return (
    <div className="dark">
      {/* The dev overlay renders into a portal and lands in the screenshot. */}
      <style>{`nextjs-portal { display: none }`}</style>
      <div className="flex h-screen w-screen items-center gap-10 overflow-hidden bg-background pl-[76px]">
        <div className="w-[46%] shrink-0">
          <div className="flex items-center gap-2.5 font-[family-name:var(--font-be-vietnam-pro)] font-bold text-[27px] tracking-[-0.035em] text-foreground">
            miniscira
            <span className="size-[7px] rounded-full bg-primary" />
          </div>

          <h1 className="mt-10 text-pretty font-[family-name:var(--font-be-vietnam-pro)] font-semibold text-[63px] leading-[1.02] tracking-[-0.045em] text-foreground">
            Research that shows its{" "}
            <span className="text-primary">working</span>.
          </h1>

          <p className="mt-6 max-w-[34ch] text-[18.5px] text-muted-foreground leading-[1.55]">
            Every search, source and cross-check rendered as a step while it
            happens — then answered with the receipts attached.
          </p>

          <div className="mt-11 flex items-center gap-2.5 font-mono text-[12.5px] text-muted-foreground tracking-[0.02em]">
            Self-hosted <i className="not-italic opacity-40">/</i> your own AI
            Gateway key <i className="not-italic opacity-40">/</i> MIT
          </div>
        </div>

        {/* The real timeline components, not a lookalike. */}
        <div className="-mr-12 min-w-0 flex-1 rounded-l-2xl border border-r-0 bg-card py-8 pr-16 pl-9 shadow-[0_30px_70px_-30px_rgb(0_0_0/55%)]">
          <p className="border-b pb-5 font-medium text-[16px] text-foreground leading-snug">
            Has solid-state battery cycle life actually improved since 2024?
          </p>

          <div className="mt-5 space-y-4">
            <ChainOfThoughtStep
              icon={RiGlobeLine}
              label="Web Search"
              open
              swapIconOnHover={false}
            >
              <QueryBadges
                queries={[
                  "solid-state battery cycle life 2026",
                  "sulfide electrolyte degradation",
                ]}
              />
            </ChainOfThoughtStep>

            <ChainOfThoughtStep
              icon={RiFileTextLine}
              label="Read 6 sources"
              open
              swapIconOnHover={false}
            >
              <ResultList
                results={[
                  { url: "https://nature.com", title: "Cycle life at scale" },
                  { url: "https://ieee.org", title: "Retention after 800 cycles" },
                ]}
              />
            </ChainOfThoughtStep>

            <ChainOfThoughtStep
              iconNode={<Live />}
              label="Cross-checking the retention claims"
              status="active"
              swapIconOnHover={false}
            />

            <ChainOfThoughtStep
              icon={RiFileTextLine}
              label="Answer"
              last
              open
              swapIconOnHover={false}
            >
              {/* Not QueryBadges — these are citations, and that helper
                  prefixes a search magnifier. */}
              <ChainOfThoughtSearchResults>
                <ChainOfThoughtSearchResult>[1]</ChainOfThoughtSearchResult>
                <ChainOfThoughtSearchResult>[2]</ChainOfThoughtSearchResult>
                <ChainOfThoughtSearchResult>[3]</ChainOfThoughtSearchResult>
              </ChainOfThoughtSearchResults>
            </ChainOfThoughtStep>
          </div>
        </div>
      </div>
    </div>
  )
}
