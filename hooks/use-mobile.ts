import * as React from "react"

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

/**
 * A media-query subscription is exactly what useSyncExternalStore is for — it
 * reads the current value during render instead of the effect-then-setState
 * round trip this used to do, so there's no first paint at the wrong breakpoint.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    // Server snapshot: assume desktop, matching the previous `!!undefined`.
    () => false
  )
}
