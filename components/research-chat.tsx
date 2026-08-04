"use client"

import type { EveMessage, EveMessagePart, SessionState } from "eve/client"
import { useRouter } from "next/navigation"
import { useCallback, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { ArtifactPanel } from "@/components/ai-elements/artifact"
import {
  AssistantTurn,
  annotationForMessage,
  collectArtifacts,
  ThinkingRow,
} from "@/components/chat/assistant-turn"
import { Composer, type Mode } from "@/components/chat/composer"
import { UserBubble } from "@/components/chat/user-bubble"
import { ComposerNotice } from "@/components/connect-gateway-note"
import type { AnswerInput } from "@/components/research-timeline"
import { DetachedNote } from "@/components/turn-status"
import { Message, MessageContent } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { useChatAttachments } from "@/hooks/use-chat-attachments"
import { useChatModel } from "@/hooks/use-chat-model"
import { useEveChat } from "@/hooks/use-eve-chat"
import { buildClientContext, conversationRecap } from "@/lib/chat-context"
import { type ChatEvent, partText } from "@/lib/chat-events"
import { cn } from "@/lib/utils"

/**
 * The subset every turn without subagent calls gets. One shared reference: a
 * fresh `{}` per render would defeat `AssistantTurn`'s memo just as thoroughly
 * as the whole-conversation object it replaces.
 */
const NO_CHILD_PARTS: Record<string, readonly EveMessagePart[]> = {}

/**
 * Last subset handed to each message. Keyed weakly by the message object,
 * which is reference-stable for a settled turn — so that turn's subset
 * survives every unrelated subagent update, and a superseded/replaced message
 * drops out on its own.
 */
const childPartsCache = new WeakMap<
  EveMessage,
  Record<string, readonly EveMessagePart[]>
>()

function sameEntries(
  a: Record<string, readonly EveMessagePart[]>,
  b: Record<string, readonly EveMessagePart[]>
) {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  // Values are part arrays compared by reference only. A deep compare here
  // would run on every render and trade one perf problem for another.
  for (const k of keys) if (a[k] !== b[k]) return false
  return true
}

/**
 * The entries of `childParts` this message actually renders: the ones keyed by
 * a tool call id in its own parts, which is exactly what
 * `components/research-timeline.tsx` looks up (`childParts?.[part.toolCallId]`).
 *
 * `childParts` covers the whole conversation and is rebuilt ~8×/second while
 * any subagent streams, so passing it whole re-renders every settled turn.
 * This returns the same object reference whenever a message's own entries are
 * unchanged, which is what keeps `turnPropsEqual`'s reference check honest.
 */
export function selectChildParts(
  message: EveMessage,
  childParts: Record<string, readonly EveMessagePart[]> | undefined
): Record<string, readonly EveMessagePart[]> {
  if (!childParts) return NO_CHILD_PARTS
  const next: Record<string, readonly EveMessagePart[]> = {}
  let found = 0
  for (const part of message.parts) {
    if (part.type !== "dynamic-tool") continue
    const nested = childParts[part.toolCallId]
    if (nested) {
      next[part.toolCallId] = nested
      found += 1
    }
  }
  if (found === 0) return NO_CHILD_PARTS
  const previous = childPartsCache.get(message)
  if (previous && sameEntries(previous, next)) return previous
  childPartsCache.set(message, next)
  return next
}

/**
 * One research conversation: the transcript, the composer, and the artifact
 * panel. Transport lives in useEveChat, attachments in useChatAttachments, and
 * clientContext assembly in lib/chat-context — this component decides what to
 * send and how to lay out what comes back.
 */
export function ResearchChat({
  chatId,
  initialEvents = [],
  initialSession,
  projectId,
  projectInstructions,
  projectLinks,
}: {
  chatId?: string
  initialEvents?: readonly ChatEvent[]
  initialSession?: SessionState
  projectId?: string
  projectInstructions?: string | null
  projectLinks?: string[]
}) {
  const router = useRouter()
  const chatIdRef = useRef<string | undefined>(chatId)
  const createdRef = useRef(false)

  const {
    messages,
    annotations,
    childParts,
    supersededIds,
    isBusy,
    canceling,
    detached,
    pendingUser,
    hasSession,
    setChatId,
    beginTurn,
    abandonTurn,
    send,
    answer,
    stop,
    supersede,
    resolveSupersede,
  } = useEveChat({ chatId, initialEvents, initialSession })

  const [input, setInput] = useState("")
  const [mode, setMode] = useState<Mode>("search")
  // Sticky model choice; rides to the agent as clientContext.chatModel where the
  // dynamic model resolver (agent/agent.ts) picks it up.
  const { chatModel, chatModelName, pickChatModel } = useChatModel()
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [openArtifactId, setOpenArtifactId] = useState<string | null>(null)

  // Per-user personalization (nickname / instructions / tone) is resolved
  // server-side into the system prompt — see agent/instructions/20-personalization.ts.
  const {
    documents,
    attachmentsByTurn,
    uploading,
    uploadFiles,
    retryUpload,
    removeDocument,
    attachToTurn,
    persistTurnBinding,
  } = useChatAttachments({
    chatId,
    projectId,
    currentChatId: () => chatIdRef.current,
  })

  /**
   * The chat row, created lazily on the first message. Returns null when it
   * can't be created — the caller has already cleared the composer and painted
   * an optimistic turn by then, so a throw here would strand both.
   */
  async function ensureChat(firstText: string): Promise<string | null> {
    if (chatIdRef.current) return chatIdRef.current
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: firstText.slice(0, 80), projectId }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        chat?: { id: string }
      }
      if (!res.ok || !json.chat) return null
      chatIdRef.current = json.chat.id
      createdRef.current = true
      window.history.replaceState(null, "", `/chat/${json.chat.id}`)
      return json.chat.id
    } catch {
      return null
    }
  }

  // Fork the conversation into a new chat that shares this one's history and
  // eve session cursor — both continue independently from this point.
  async function branchChat() {
    if (!chatIdRef.current) return
    try {
      const res = await fetch(`/api/chats/${chatIdRef.current}/branch`, {
        method: "POST",
      })
      const json = (await res.json()) as {
        chat?: { id: string }
        error?: string
      }
      if (!res.ok || !json.chat) {
        toast.error(json.error ?? "Couldn't branch this chat")
        return
      }
      router.push(`/chat/${json.chat.id}`)
    } catch {
      toast.error("Couldn't branch this chat")
    }
  }

  async function submit(
    submitText?: string,
    modelOverride?: string
  ): Promise<boolean> {
    const text = (submitText ?? input).trim()
    if (!text || isBusy) return false
    setInput("")
    // Before any await: on a chat's first message `ensureChat` is a round trip,
    // and until this lands the question has vanished from the composer with
    // nothing to show it was received.
    beginTurn(text)

    // Staged attachments ride along with THIS message.
    const turnIndex = messages.filter((m) => m.role === "user").length
    const attached = attachToTurn(turnIndex)

    const id = await ensureChat(text)
    if (!id) {
      // Nothing was sent, so hand the question back rather than leaving the
      // composer empty with a pending bubble that will never resolve.
      abandonTurn()
      setInput((current) => current || text)
      toast.error("Couldn't start this chat. Your question is back in the box.")
      return false
    }
    setChatId(id)
    persistTurnBinding(attached, turnIndex)

    // Attachments ride to the model natively as file parts — eve's message
    // schema only accepts "text"/"file" (no separate "image" part type);
    // models with vision read image-mediaType file parts directly. Documents
    // are ALSO indexed for search_documents, so they stay searchable across chats.
    const fileParts = attached
      .filter(
        (d) => d.url && (d.kind === "image" || d.mimeType === "application/pdf")
      )
      .map((d) => ({
        type: "file" as const,
        data: new URL(d.url as string),
        mediaType:
          d.mimeType ?? (d.kind === "image" ? "image/png" : "application/pdf"),
        filename: d.filename,
      }))

    const context = (recap: string | null) =>
      buildClientContext({
        chatModel: modelOverride ?? chatModel,
        projectInstructions,
        projectLinks,
        deepResearch: mode === "deep",
        uploadedDocuments: attached
          .filter((d) => d.kind !== "image")
          .map((d) => d.filename),
        conversationRecap: recap,
      })
    // A recap is only worth sending to a session that hasn't seen this chat:
    // one that was branched from another, or a fresh one replacing a session
    // that turned out to be gone. eve sessions can't be forked, so it's the
    // only way the agent knows about history the reader can still see.
    const recap = () =>
      messages.length === 0 ? null : conversationRecap(messages)

    const sent = await send({
      optimisticText: text,
      message:
        fileParts.length > 0 ? [{ type: "text", text }, ...fileParts] : text,
      clientContext: context(hasSession() ? null : recap()),
      freshContext: () => context(recap()),
    })

    // A send that never landed leaves the reader with an empty composer and no
    // answer coming. Put the question back so retrying is one keystroke, not a
    // retype — `send` has already explained what went wrong.
    if (!sent) setInput((current) => current || text)

    if (sent && createdRef.current) {
      createdRef.current = false
      // Generate a short title from the question (non-blocking), then refresh
      // the sidebar so it updates from "New research".
      void fetch(`/api/chats/${id}/title`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      })
    }
    return sent
  }

  // `submit` closes over `messages`, so wrapping it in useCallback would still
  // hand Composer a new reference on every streamed token and defeat its memo.
  // Route through a ref instead: the callback identity never changes, and the
  // call always reaches the current `submit`.
  const submitRef = useRef(submit)
  submitRef.current = submit
  const onSubmit = useCallback(() => void submitRef.current(), [])

  // Index of the last question asked, or -1. Both retry and edit rewind to here.
  let lastQuestion = -1
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      lastQuestion = i
      break
    }
  }

  /**
   * Replace the trailing turn: hide the last question and everything after it,
   * then ask again. Passing `text` edits the question; omitting it retries the
   * same one on `modelId`.
   *
   * eve sessions are append-only, so "delete" here means marking those messages
   * superseded (persisted once the new turn starts) rather than stacking a
   * second answer under the first.
   */
  const replaceLastTurn = async (text?: string, modelId?: string) => {
    if (isBusy || lastQuestion === -1) return
    const question = messages[lastQuestion]
    const next = text ?? partText(question.parts, "text")
    if (!next) return
    // Everything from the question onward: the question and its answer, plus a
    // second assistant message if the turn produced one.
    const ids = messages.slice(lastQuestion).map((m) => m.id)
    supersede(ids)
    resolveSupersede(ids, await submit(next, modelId))
  }

  // Answering a question mid-turn has to repeat the model marker and the project
  // instructions: clientContext applies to a single model call, so without them
  // the resumed research would continue on the default model with the project's
  // instructions missing.
  const answerInput: AnswerInput = (requestId, response) => {
    answer(
      requestId,
      response,
      buildClientContext({ chatModel, projectInstructions })
    )
  }

  // Scanning every message's parts is per-conversation work, and this component
  // re-renders on every streamed token — without the memo it re-scans the whole
  // transcript thousands of times per answer.
  const artifacts = useMemo(() => collectArtifacts(messages), [messages])
  // Only treat the panel as open when its artifact still exists (survives
  // branch/reload). A valid id keeps the browsable panel docked on the right.
  const panelOpen =
    openArtifactId != null && artifacts.some((a) => a.id === openArtifactId)
  const lastIsUser = messages.at(-1)?.role === "user"
  // Shown from the moment the turn is submitted, including while the optimistic
  // bubble is still standing in for the server's echo. `!pendingUser` used to
  // gate it out, which meant the indicator waited for `message.received` to
  // land before appearing — a send looked like it had gone nowhere for the
  // whole server round trip. The optimistic bubble renders directly above this,
  // so the pair appears together, in order, on the same frame as the keypress.
  const showThinking =
    isBusy && (pendingUser != null || lastIsUser || messages.length === 0)
  const isEmpty = messages.length === 0 && !pendingUser
  // The user-turn ordinal of each message (for attachment lookup); -1 for
  // assistant. A plain loop, not `.map`, because it also yields the running
  // count that `pendingTurn` needs.
  const userTurnOf: number[] = []
  let userTurns = 0
  for (const m of messages)
    userTurnOf.push(m.role === "user" ? userTurns++ : -1)
  const pendingTurn = userTurns

  // Composer is memoized, which only works because every callback below is
  // reference-stable: ingest() sets state per streamed token, so anything that
  // changes identity per render would re-render the whole composer with it.
  const composer = (
    <Composer
      canceling={canceling}
      chatModel={chatModel}
      chatModelName={chatModelName}
      documents={documents}
      input={input}
      isBusy={isBusy}
      mode={mode}
      modelPickerOpen={modelPickerOpen}
      onInputChange={setInput}
      onModeChange={setMode}
      onModelPickerOpenChange={setModelPickerOpen}
      onPickModel={pickChatModel}
      onRemoveDocument={removeDocument}
      onRetryDocument={retryUpload}
      onStop={stop}
      onSubmit={onSubmit}
      onUpload={uploadFiles}
      uploading={uploading}
    />
  )

  // The connect prompt wraps the composer rather than being placed beside it,
  // and is built once here because both the empty state and the transcript
  // render the same block — a user with no gateway credential needs it in
  // either. `ComposerNotice` renders children untouched when there is nothing
  // to say, so the common path pays no wrapper.
  const composerBlock = <ComposerNotice>{composer}</ComposerNotice>

  return (
    // autoScroll pins the viewport to the latest tokens while streaming; it backs
    // off the moment the reader scrolls up. scrollAnchor (on user turns) settles
    // each new question near the top with a peek of the prior exchange.
    <MessageScrollerProvider autoScroll scrollPreviousItemPeek={48}>
      <div className="flex h-full min-h-0">
        <div
          className={cn(
            "flex h-full min-w-0 flex-1 flex-col",
            panelOpen && "max-sm:hidden"
          )}
        >
          {isEmpty ? (
            <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
              <div className="w-full max-w-2xl">
                <div className="mb-2 text-center">
                  <h1 className="font-(family-name:--font-be-vietnam-pro) font-light text-4xl text-foreground tracking-tight">
                    miniscira
                  </h1>
                </div>
                {composerBlock}
              </div>
            </div>
          ) : (
            <>
              <div className="relative min-h-0 flex-1 overflow-hidden">
                <MessageScroller>
                  <MessageScrollerViewport>
                    <MessageScrollerContent
                      aria-busy={isBusy}
                      className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-6 md:px-6"
                    >
                      {messages.map((message, i) =>
                        // A superseded turn (replaced by a retry) is hidden entirely.
                        supersededIds.has(message.id) ? null : (
                          <MessageScrollerItem
                            key={message.id}
                            scrollAnchor={message.role === "user"}
                          >
                            {message.role === "user" ? (
                              <UserBubble
                                text={partText(message.parts, "text")}
                                attachments={attachmentsByTurn[userTurnOf[i]]}
                                // Only the latest question can be edited: an
                                // earlier one would orphan every answer after it.
                                onEdit={
                                  i === lastQuestion && !isBusy
                                    ? (next) => void replaceLastTurn(next)
                                    : undefined
                                }
                              />
                            ) : (
                              <AssistantTurn
                                message={message}
                                streaming={isBusy && i === messages.length - 1}
                                onAnswer={answerInput}
                                busy={isBusy}
                                onRetry={
                                  i === messages.length - 1 &&
                                  messages[i - 1]?.role === "user"
                                    ? (modelId) =>
                                        void replaceLastTurn(undefined, modelId)
                                    : undefined
                                }
                                onBranch={
                                  i === messages.length - 1
                                    ? branchChat
                                    : undefined
                                }
                                onOpenArtifact={setOpenArtifactId}
                                activeArtifactId={
                                  panelOpen ? openArtifactId : null
                                }
                                annotation={annotationForMessage(
                                  annotations,
                                  message,
                                  i === messages.length - 1
                                )}
                                // Only this turn's own subagent parts: the
                                // whole-conversation object changes identity
                                // ~8×/second while any subagent streams and
                                // would re-render every settled turn with it.
                                childParts={selectChildParts(
                                  message,
                                  childParts
                                )}
                              />
                            )}
                          </MessageScrollerItem>
                        )
                      )}
                      {pendingUser && (
                        <MessageScrollerItem scrollAnchor>
                          <UserBubble
                            text={pendingUser}
                            attachments={attachmentsByTurn[pendingTurn]}
                          />
                        </MessageScrollerItem>
                      )}
                      {showThinking && (
                        <MessageScrollerItem>
                          <Message align="start">
                            <MessageContent className="pt-1">
                              <ThinkingRow />
                            </MessageContent>
                          </Message>
                        </MessageScrollerItem>
                      )}
                      {detached && (
                        <MessageScrollerItem>
                          <Message align="start">
                            <MessageContent className="pt-1">
                              <DetachedNote
                                onReattach={() => router.refresh()}
                              />
                            </MessageContent>
                          </Message>
                        </MessageScrollerItem>
                      )}
                    </MessageScrollerContent>
                  </MessageScrollerViewport>
                  <MessageScrollerButton />
                </MessageScroller>

                {/* A short fade at the very bottom edge so content dissolves
                  gently into the composer instead of ending on a hard line —
                  the content itself stays fully visible above it. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 -bottom-1 h-4 bg-gradient-to-t from-background to-transparent"
                />
              </div>

              <div className="mx-auto w-full max-w-3xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6">
                {composerBlock}
                <p className="mt-2 text-pretty text-center text-muted-foreground text-xs">
                  MiniScira can make mistakes. Verify important facts from the
                  cited sources.
                </p>
              </div>
            </>
          )}
        </div>
        {panelOpen && openArtifactId && (
          <ArtifactPanel
            artifacts={artifacts}
            activeId={openArtifactId}
            onSelect={setOpenArtifactId}
            onClose={() => setOpenArtifactId(null)}
          />
        )}
      </div>
    </MessageScrollerProvider>
  )
}
