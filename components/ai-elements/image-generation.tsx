"use client"

import { BorderBeam } from "border-beam"
import type { CSSProperties } from "react"

import { cn } from "@/lib/utils"

// AIcss Image Generation (aicss.dev/components/image-generation): a dot-matrix
// canvas placeholder shown while an image generates — a dim dot grid with a soft
// radial bloom breathing out from the center, a resolution badge, and the prompt
// underneath. The grid + bloom live in the `.dotmatrix-canvas` CSS.
export type ImageAspect = "square" | "portrait" | "landscape"

const ASPECT: Record<ImageAspect, string> = {
  square: "aspect-square",
  portrait: "aspect-[3/4]",
  landscape: "aspect-[4/3]",
}

export function ImageGeneration({
  prompt,
  resolution = "1024 × 1024",
  aspect = "square",
  className,
}: {
  prompt?: string
  resolution?: string
  aspect?: ImageAspect
  className?: string
}) {
  return (
    <div className={cn("my-3 w-full max-w-xs", className)}>
      <BorderBeam
        active
        colorVariant="sunset"
        hueRange={10}
        strength={0.7}
        theme="dark"
        borderRadius={22}
        className={cn("w-full", ASPECT[aspect])}
        style={{ "--beam-hue-base": "86deg" } as CSSProperties}
      >
        <div
          role="img"
          aria-label={
            prompt ? `Generating image: ${prompt}` : "Generating image"
          }
          className="dotmatrix-canvas relative size-full overflow-hidden rounded-[22px] bg-card/40"
        >
          <span className="absolute top-2.5 right-3 font-mono text-muted-foreground text-xs">
            {resolution}
          </span>
        </div>
      </BorderBeam>
      <div className="mt-2.5 flex flex-col gap-0.5">
        <span className="font-medium text-foreground text-sm">
          Generating image
        </span>
        {prompt && (
          <span className="truncate text-muted-foreground text-sm">
            &ldquo;{prompt}&rdquo;
          </span>
        )}
      </div>
    </div>
  )
}
