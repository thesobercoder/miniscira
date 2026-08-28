"use client"

import type { UserContent } from "ai"
import { Client, type ClientSession, type SessionState } from "eve/client"
import { useCallback, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { useEventProjection } from "@/hooks/use-event-projection"
import { useEventQueue } from "@/hooks/use-event-queue"
import { useMountEffect } from "@/hooks/use-mount-effect"
import { useSubagentStreams } from "@/hooks/use-subagent-streams"
import {
  type ChatEvent,
  eventType,
  INPUT_RESPONDED_EVENT,
  type InputResponse,
  isClientEvent,
  isTurnBoundary,
  SUPERSEDE_EVENT,
  subagentCallId,
} from "@/lib/chat-events"
import { consumeDurableTurn } from "@/lib/eve-stream-consume"
import { EVE_LONG_RUNNING_STREAM_POLICY } from "@/lib/eve-stream-policy"
import { segmentedMessageReducer } from "@/lib/message-reducer"
import { collectSubagentCalls, subagentChild } from "@/lib/subagent-stream"
import {
  beginStreaming,
  clearOptimistic,
  detach,
  READY,
  requestCancel,
  settle,
  submit,
  type TurnState,
  turnFlags,
} from "@/lib/turn-state"

/**
 * Owns one chat's live connection to the agent: the eve client/session, the
 * durable-stream cursor, reconnection, and the turn lifecycle.
 *
 * This is deliberately transport-only. It knows how to get a message to the
 * agent and how to follow what comes back; it knows nothing about composers,
 * documents, project instructions, or what belongs in clientContext. Callers
 * build the message and hand it over.
 *
 * The three concerns that don't need a session live beside it and are composed
 * here: `useEventProjection` (events → transcript), `useEventQueue`
 * (transcript → database), `useSubagentStreams` (delegated runs).
 */

export type SendInput = {
  message: UserContent
  clientContext?: Record<string, string | string[]>
  /** Shown immediately as the user's turn while the server catches up. */
  optimisticText: string
  /**
   * Context to use if the stored session turns out to be gone and the message
   * has to go to a brand-new one. That session has never seen this chat, so
   * this is where a recap of the visible history belongs.
   */
  freshContext?: () => Record<string, string | string[]> | undefined
  /** Runs once Eve accepts the message, before following the streamed turn. */
  onAccepted?: () => void
}

type Options = {
  chatId?: string
  initialEvents?: readonly ChatEvent[]
  initialSession?: SessionState
}

/**
 * Whether a send that produced no turn is evidence the durable session is gone.
 *
 * The invariant: `forgetSession()` is only correct when the server actually
 * answered. A null response means the request never landed — offline, DNS, a
 * dead gateway — and the session it was bound to is very likely still alive.
 * Dropping it there would destroy the continuation token, the sandbox, and the
 * compacted history over a transient blip.
 */
export function shouldForgetSession({
  response,
  followed,
  hadSession,
}: {
  response: unknown
  followed: boolean
  hadSession: boolean
}): boolean {
  return response != null && !followed && hadSession
}

/**
 * Drain one stream until a turn boundary, or until it ends on its own.
 *
 * Breaking *on* the boundary rather than waiting for the iterator to return is
 * the whole point. eve keeps a durable session's stream open after
 * `session.completed` — the session outlives the turn, so there is nothing to
 * close — and the previous version only checked `settled` once the `for await`
 * had finished. It never did, so a turn that had visibly finished answering
 * left the composer locked in its streaming state until the tab was reloaded.
 *
 * Exported for the test: this is a rule about when to stop reading, and it is
 * worth being able to assert without mounting the hook.
 */
export async function drainUntilBoundary(
  stream: AsyncIterable<ChatEvent>,
  onEvent: (event: ChatEvent) => void
): Promise<{ settled: boolean; received: number }> {
  let received = 0
  for await (const event of stream) {
    received += 1
    onEvent(event)
    if (isTurnBoundary(event)) return { settled: true, received }
  }
  return { settled: false, received }
}

export function useEveChat({
  chatId,
  initialEvents = [],
  initialSession,
}: Options) {
  // We drive eve/client directly (instead of useEveAgent) so a reload can
  // re-attach to an in-flight turn's durable stream.
  const reducer = useMemo(() => segmentedMessageReducer(), [])

  const projection = useEventProjection({ reducer, initialEvents })
  const queue = useEventQueue(chatId)
  const subagents = useSubagentStreams({ reducer, initialEvents })

  const clientRef = useRef<Client | null>(null)
  const sessionRef = useRef<ClientSession | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const cursorRef = useRef<SessionState>(
    initialSession ?? { streamIndex: initialEvents.length }
  )
  // One value, not four booleans. See lib/turn-state.ts for why.
  const [turn, setTurn] = useState<TurnState>(READY)

  // Destructured, not used through the container objects: each hook returns a
  // fresh object literal every render, so a `useCallback` that depended on
  // `queue` or `projection` would be rebuilt on every render and defeat every
  // memo below it. The individual callbacks are stable.
  const { enqueue, enqueueNow, flush, patchCursor, clearCursor, setChatId } =
    queue
  const { project } = projection
  const { attach, ingestChild, markDone } = subagents

  const ingest = useCallback(
    (event: ChatEvent) => {
      // Projection dedupes; a null means the log already held this event and
      // every effect below — which is written to run once per event — must be
      // skipped.
      const eve = project(event)
      if (!eve) return
      const type = eventType(event)
      if (type === "subagent.completed") {
        const callId = subagentCallId(event)
        if (callId) markDone(callId)
      }
      // Attach the moment the delegation is announced — no state round trip.
      if (type === "subagent.called") {
        const call = collectSubagentCalls([eve])[0]
        if (call) attach(call)
      }
      // Inline subagents forward their events instead; harmless when unused.
      const child = subagentChild(eve)
      if (child) ingestChild(child.callId, child.event)
      enqueue(event)
      if (type === "message.received") setTurn(clearOptimistic)
    },
    [project, enqueue, attach, ingestChild, markDone]
  )

  // Always build a fresh ClientSession from the latest cursor. ClientSession
  // state is immutable per instance, so reusing one would send follow-ups and
  // HITL answers without the continuation token — the server then rejects them
  // (or spawns a fresh conversation) instead of resuming the same session.
  const getSession = useCallback(() => {
    // preserveCompletedSessions: keep the continuation token (and any
    // framework-managed sandbox state) across follow-ups even if a turn ever
    // ends on session.completed instead of parking on session.waiting.
    // Without it a completed turn resets the client session and the next
    // send() would silently start a fresh server-side conversation.
    clientRef.current ??= new Client({
      host: "",
      preserveCompletedSessions: true,
    })
    sessionRef.current = clientRef.current.session(
      cursorRef.current.sessionId ? cursorRef.current : undefined
    )
    return sessionRef.current
  }, [])

  /**
   * Follows a turn's stream to settlement.
   *
   * Returns false when the turn produced nothing at all — no events and no
   * boundary, across every reattempt. A live turn always emits something, so
   * that combination means the durable session behind the cursor is gone
   * (destroyed, expired via `sessionTimeoutMs`, or its event log corrupted) and
   * the caller should start a fresh one rather than keep retrying a dead id.
   */
  const consume = useCallback(
    async (
      iterable: AsyncIterable<ChatEvent>,
      onStarted?: () => void | Promise<void>
    ) => {
      setTurn(beginStreaming)
      // A turn ends when a boundary event says so — not when an iterator stops.
      // Each Eve iterator has a bounded retry budget; once spent, reopen from
      // the persisted cursor for as long as this durable turn remains active.
      let settled = false
      let received = 0
      let started = false
      try {
        const consumed = await consumeDurableTurn({
          initialStream: iterable,
          reopen: () =>
            getSession().stream({
              startIndex: cursorRef.current.streamIndex,
              signal: abortRef.current?.signal ?? undefined,
              streamReconnectPolicy: EVE_LONG_RUNNING_STREAM_POLICY,
            }),
          isBoundary: isTurnBoundary,
          onEvent: async (event) => {
            if (!started) {
              started = true
              await onStarted?.()
            }
            ingest(event)
          },
          signal: abortRef.current?.signal,
        })
        settled = consumed.settled
        received = consumed.received
        if (!settled && !abortRef.current?.signal.aborted) setTurn(detach)
      } finally {
        // `settle`, not `READY`: it drops the optimistic bubble and any
        // "Stopping…" affordance but carries `detached` across. Resetting to a
        // clean ready state here is what previously erased the detached flag
        // set a few lines above, before it could ever render.
        setTurn(settle)
        // Merge the settled cursor; keep the sessionId we already captured if the
        // state cursor hasn't filled it in.
        const state = sessionRef.current?.state
        cursorRef.current = {
          sessionId: state?.sessionId ?? cursorRef.current.sessionId,
          continuationToken:
            state?.continuationToken ?? cursorRef.current.continuationToken,
          streamIndex: state?.streamIndex ?? cursorRef.current.streamIndex,
        }
        await patchCursor(cursorRef.current)
        await flush()
      }
      return settled || received > 0
    },
    [ingest, getSession, patchCursor, flush]
  )

  // Resume an in-flight turn after a reload: if the last persisted event isn't a
  // turn boundary, re-attach to the durable stream from where we left off. The
  // server's stream index counts only its own events, so exclude any client
  // projection events we persisted alongside them.
  // Mount-only: re-running would re-attach to the stream and duplicate events.
  useMountEffect(() => {
    const last = initialEvents.at(-1)
    const inFlight = last && !isTurnBoundary(last) && initialSession?.sessionId
    if (!inFlight) return
    const startIndex = initialEvents.filter((e) => !isClientEvent(e)).length
    const session = getSession()
    const ac = new AbortController()
    abortRef.current = ac
    void consume(
      session.stream({
        startIndex,
        signal: ac.signal,
        streamReconnectPolicy: EVE_LONG_RUNNING_STREAM_POLICY,
      })
    )
    return () => ac.abort()
  })

  /* --------------------------------- actions ------------------------------ */

  const { isBusy, canceling, detached, pendingUser } = turnFlags(turn)

  /**
   * Adopt the cursor a fresh turn came back with, then follow its stream.
   *
   * sessionId is on the response immediately (session.state isn't populated
   * until the turn settles), so it's persisted now — a reload mid-stream needs
   * it to re-attach to the durable stream. The PATCH is deliberately not
   * awaited: `consume` is what starts rendering tokens, and blocking it on a
   * round trip just delays the first visible output.
   */
  const followTurn = useCallback(
    async (
      turnResponse: {
        sessionId?: string
        continuationToken?: string
      } & AsyncIterable<ChatEvent>,
      onStarted?: () => void | Promise<void>
    ) => {
      cursorRef.current = {
        sessionId: turnResponse.sessionId,
        continuationToken: turnResponse.continuationToken,
        streamIndex: cursorRef.current.streamIndex,
      }
      void patchCursor(cursorRef.current)
      return await consume(turnResponse, onStarted)
    },
    [patchCursor, consume]
  )

  /**
   * Forget the durable session this chat was bound to.
   *
   * Used when the session turns out to be gone. The transcript is untouched —
   * it lives in the persisted event log, not the session — so the next send
   * opens a fresh session and the caller can seed it with a recap of what the
   * reader can still see above the composer.
   */
  const forgetSession = useCallback(async () => {
    cursorRef.current = { streamIndex: cursorRef.current.streamIndex }
    sessionRef.current = null
    await clearCursor()
  }, [clearCursor])

  /**
   * Rewind onto a fresh session while keeping a rollback point.
   *
   * Retry/edit cannot continue the append-only session that saw the discarded
   * future. If the replacement never lands, the caller restores this snapshot
   * so the original conversation remains fully resumable.
   */
  const resetSession = useCallback(async () => {
    const previous = { ...cursorRef.current }
    await forgetSession()
    return previous
  }, [forgetSession])

  const restoreSession = useCallback(
    async (previous: SessionState) => {
      cursorRef.current = previous
      sessionRef.current = null
      await patchCursor(previous)
    },
    [patchCursor]
  )

  /**
   * Paint the user's turn straight away.
   *
   * Callers usually have work to do before they can call `send` — creating the
   * chat row on the first message, binding attachments — and every await of that
   * is dead air where the question has left the composer but nothing has appeared
   * in its place. Announce the turn first, then go do it.
   */
  const beginTurn = useCallback((optimisticText: string) => {
    setTurn(submit(optimisticText))
  }, [])

  /**
   * Undo `beginTurn` when the work between it and `send` fails — creating the
   * chat row, for instance. Without this the optimistic bubble sits there under
   * a busy composer waiting for a turn that was never started.
   */
  const abandonTurn = useCallback(() => {
    setTurn(READY)
  }, [])

  const send = useCallback(
    async ({
      message,
      clientContext,
      optimisticText,
      freshContext,
      onAccepted,
    }: SendInput): Promise<boolean> => {
      // A no-op when the caller already announced this turn via beginTurn.
      setTurn(submit(optimisticText))

      const attempt = async (context: SendInput["clientContext"]) => {
        const session = getSession()
        const ac = new AbortController()
        abortRef.current = ac
        try {
          return await session.send({
            message,
            signal: ac.signal,
            clientContext: context,
            streamReconnectPolicy: EVE_LONG_RUNNING_STREAM_POLICY,
          })
        } catch (err) {
          if ((err as Error)?.name !== "AbortError")
            console.error("eve send error", err)
          return null
        }
      }

      // Whether this send was riding an existing session. Only then is "the turn
      // produced nothing" evidence of a dead session rather than a dead network.
      const hadSession = cursorRef.current.sessionId != null
      const response = await attempt(clientContext)
      const followed =
        response != null &&
        (await followTurn(response, () => {
          onAccepted?.()
        }))
      if (followed) return true

      if (!shouldForgetSession({ response, followed, hadSession })) {
        // A null response means we never heard back from the server, so the
        // send simply did not happen. Say so, and leave the session bound.
        if (response == null)
          toast.error(
            "Couldn't reach the server. Your message wasn't sent — try again."
          )
        setTurn(READY)
        return Boolean(response)
      }

      // The session this chat was bound to is gone — destroyed, expired, or its
      // event log corrupted. Drop it and ask again on a fresh one, seeded with
      // whatever recap the caller builds for a chat with no history behind it.
      //
      // INVARIANT: forgetSession() is only correct when the server answered.
      // Reaching here requires a non-null response (see shouldForgetSession);
      // never call it on a transport failure — that destroys a live session.
      console.warn("eve session unavailable; retrying on a fresh session")
      await forgetSession()
      setTurn(submit(optimisticText))
      const retry = await attempt(freshContext?.() ?? clientContext)
      if (!retry) {
        setTurn(READY)
        return false
      }
      return await followTurn(retry, () => {
        onAccepted?.()
      })
    },
    [getSession, followTurn, forgetSession]
  )

  /** Answer a pending HITL request (ask_question or an approval) and resume. */
  const answer = useCallback(
    (
      requestId: string,
      response: { optionId?: string; text?: string },
      clientContext?: Record<string, string | string[]>
    ) => {
      if (isBusy) return
      void (async () => {
        const session = getSession()
        const ac = new AbortController()
        abortRef.current = ac
        // No optimistic bubble: an HITL answer renders from the projected
        // question node, not as a new user turn.
        setTurn(submit(null))
        const responses: InputResponse[] = [{ requestId, ...response }]
        let resp: Awaited<ReturnType<typeof session.send>>
        try {
          resp = await session.send({
            inputResponses: responses,
            clientContext,
            signal: ac.signal,
            streamReconnectPolicy: EVE_LONG_RUNNING_STREAM_POLICY,
          })
        } catch (err) {
          if ((err as Error)?.name === "AbortError") {
            setTurn(READY)
            return
          }
          console.error("eve answer error", err)
          setTurn(READY)
          // The question stays unanswered and re-answerable. Projecting the
          // answer before this point would have persisted it, leaving the
          // prompt permanently "answered" with no turn behind it.
          toast.error("Couldn't send your answer. Try again.")
          return
        }
        // Only once the server has it: project the answer into the reducer (and
        // persist it) so the question renders answered and stays that way
        // across a reload.
        ingest({
          type: INPUT_RESPONDED_EVENT,
          data: {
            createdAt: Date.now(),
            responses: [{ requestId, ...response }],
          },
        })
        await followTurn(resp)
      })()
    },
    [isBusy, ingest, getSession, followTurn]
  )

  // Stop = cancel the durable turn on the server, not just detach the browser.
  // Aborting the fetch alone leaves the turn running (and billing) server-side
  // — eve turns are resumable, so a local abort never stops them. session.cancel()
  // asks the active turn to stop cooperatively; we keep consuming the stream so it
  // settles on turn.cancelled → session.waiting and the cursor advances cleanly.
  // Only hard-detach locally if the cancel request itself fails (e.g. offline).
  const stop = useCallback(() => {
    const session = sessionRef.current
    setTurn(requestCancel)
    if (session) session.cancel().catch(() => abortRef.current?.abort())
    else abortRef.current?.abort()
  }, [])

  /** Persist an accepted replacement so the collapse survives reload. */
  const commitSupersede = useCallback(
    (ids: readonly string[]) => enqueueNow({ type: SUPERSEDE_EVENT, ids }),
    [enqueueNow]
  )

  return {
    messages: projection.messages,
    annotations: projection.annotations,
    supersededIds: projection.supersededIds,
    childParts: subagents.childParts,
    isBusy,
    canceling,
    /** The turn is still running server-side but we stopped receiving it. */
    detached,
    pendingUser,
    /**
     * True once this chat is bound to a durable eve session. A function, not a
     * value: the cursor lives in a ref that `send`/`answer`/`consume` mutate
     * without a re-render, so a value snapshotted at render time would only be
     * fresh by coincidence of some other state having changed.
     */
    hasSession: () => cursorRef.current.sessionId != null,
    setChatId,
    beginTurn,
    abandonTurn,
    send,
    answer,
    stop,
    resetSession,
    restoreSession,
    supersede: projection.supersede,
    commitSupersede,
    unsupersede: projection.unsupersede,
  }
}
