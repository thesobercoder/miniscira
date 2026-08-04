// biome-ignore-all lint/style/noRestrictedImports: this IS the sanctioned wrapper
import { type EffectCallback, useEffect } from "react"

/**
 * Run an effect once on mount, with optional cleanup on unmount.
 *
 * The only sanctioned way to reach `useEffect` in this codebase — see
 * `.claude/skills/no-use-effect`. Everything else should be derived state, an
 * event handler, or a data-fetching hook. Wrapping it here makes the intent
 * ("sync with an external system for this component's lifetime") explicit and
 * removes the empty-dependency-array noise from call sites.
 *
 * Because the effect never re-runs, anything it closes over must be stable —
 * refs, singletons, or values captured deliberately at mount.
 */
export function useMountEffect(effect: EffectCallback) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only is the point
  useEffect(effect, [])
}
