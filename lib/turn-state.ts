/**
 * The lifecycle of one chat turn, as a single value.
 *
 * This used to be four independent `useState`s — `status`, `canceling`,
 * `detached`, `pendingUser` — written in lockstep at eight call sites. Nothing
 * stopped them drifting: `{ status: "ready", canceling: true, detached: true }`
 * was representable and meaningless, and keeping the quartet consistent was a
 * rule you had to remember rather than one the compiler enforced.
 *
 * Modelling it as a union makes the illegal combinations unrepresentable —
 * `canceling` and `detached` only exist while a turn is actually running — and
 * turns each multi-setter sequence into one named transition.
 *
 * The transitions are pure functions so they can be tested without React.
 */

export type TurnState =
  | {
      phase: "ready"
      /**
       * We stopped receiving a turn that is still running server-side.
       *
       * This outlives the active phases on purpose, and it is the reason the
       * ready arm is not simply `{ phase: "ready" }`. When the browser runs out
       * of re-attach attempts the local turn *is* over — the composer should
       * unlock — but the agent is still working and still billing, and the
       * transcript has to say so. A ready arm with no room for this flag meant
       * settling silently discarded it and the notice never rendered.
       */
      detached: boolean
    }
  | {
      phase: "submitted" | "streaming"
      /** The user's text, painted before the server echoes it back. */
      optimistic: string | null
      /** Stop pressed. The server settles at the next step boundary. */
      canceling: boolean
      /** Gave up re-attaching; the turn is still running server-side. */
      detached: boolean
    }

export const READY: TurnState = { phase: "ready", detached: false }

/**
 * The turn is over locally.
 *
 * Carries `detached` across, and drops everything else: the optimistic bubble
 * and any "Stopping…" affordance both belong to a turn that no longer exists.
 * Use this rather than `READY` wherever a *running* turn ends, or a detached
 * turn settles into a clean ready state and the notice disappears.
 */
export function settle(prev: TurnState): TurnState {
  return { phase: "ready", detached: prev.detached }
}

/**
 * Announce a turn before it has produced anything.
 *
 * Always clears `canceling` and `detached`: a turn that is only now starting
 * cannot already be cancelling or detached, and carrying either over from the
 * previous turn is how a stale "Stopping…" affordance would survive into the
 * next question. This is also what retires a detached notice — asking something
 * new is the point at which the abandoned turn stops being worth reporting.
 */
export function submit(optimistic: string | null): TurnState {
  return { phase: "submitted", optimistic, canceling: false, detached: false }
}

/** The turn's stream opened. Re-clears `detached` on a successful re-attach. */
export function beginStreaming(prev: TurnState): TurnState {
  if (prev.phase === "ready")
    return {
      phase: "streaming",
      optimistic: null,
      canceling: false,
      detached: false,
    }
  return { ...prev, phase: "streaming", detached: false }
}

/** Out of re-attempts. The turn runs on server-side; we stopped hearing it. */
export function detach(prev: TurnState): TurnState {
  return { ...prev, detached: true }
}

/** Stop pressed. Cooperative, so the turn stays active until it settles. */
export function requestCancel(prev: TurnState): TurnState {
  return prev.phase === "ready" ? prev : { ...prev, canceling: true }
}

/** The server echoed the user's message, so drop the optimistic copy. */
export function clearOptimistic(prev: TurnState): TurnState {
  return prev.phase === "ready" ? prev : { ...prev, optimistic: null }
}

/** Everything a consumer needs, derived so the union stays the only source. */
export function turnFlags(turn: TurnState) {
  const active = turn.phase !== "ready"
  return {
    isBusy: active,
    canceling: active && turn.canceling,
    // Not gated on `active`: a detached turn settles to ready while the agent
    // keeps running, and that is exactly when the notice has to show.
    detached: turn.detached,
    pendingUser: active ? turn.optimistic : null,
  }
}
