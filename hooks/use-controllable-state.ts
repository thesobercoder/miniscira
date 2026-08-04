"use client"

import { useCallback, useState } from "react"

/**
 * Controlled-or-uncontrolled state, the one piece of `@radix-ui/react-use-controllable-state`
 * this app still used after the Base UI migration.
 *
 * Base UI has the same helper but only under `@base-ui/react/internals/*`, which
 * is explicitly unstable and not part of its public surface — so this is a local
 * ~20-line reimplementation rather than a dependency on someone's internals.
 *
 * Semantics match Radix's: when `prop` is defined the component is controlled and
 * local state is bypassed entirely; `onChange` fires only on an actual change, so
 * a no-op set doesn't churn consumers.
 */
export function useControllableState<T>({
  prop,
  defaultProp,
  onChange,
}: {
  prop?: T
  defaultProp: T
  onChange?: (value: T) => void
}): [T, (next: T | ((prev: T) => T)) => void] {
  const [uncontrolled, setUncontrolled] = useState<T>(defaultProp)
  const isControlled = prop !== undefined
  const value = isControlled ? (prop as T) : uncontrolled

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved =
        typeof next === "function" ? (next as (prev: T) => T)(value) : next
      if (!isControlled) setUncontrolled(resolved)
      if (!Object.is(resolved, value)) onChange?.(resolved)
    },
    [isControlled, onChange, value]
  )

  return [value, setValue]
}
