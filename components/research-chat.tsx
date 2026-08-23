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
import {
  type UploadedDoc,
  useChatAttachments,
} from "@/hooks/use-chat-attachments"
import { useChatModel } from "@/hooks/use-chat-model"
import { useEveChat } from "@/hooks/use-eve-chat"
import { useMountEffect } from "@/hooks/use-mount-effect"
import { buildClientContext, conversationRecap } from "@/lib/chat-context"
import { type ChatEvent, partText } from "@/lib/chat-events"
import { chatCreatedEvent, chatTitledEvent } from "@/lib/chat-list-events"
import { chatTurnPath } from "@/lib/chat-route"
import {
  messagesBeforeReplacement,
  nextReplacementTurnIndex,
  replacementMessageIds,
} from "@/lib/replace-turn"
import { withoutInitialQuery } from "@/lib/urls"
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
  return keys.every((key) => a[key] === b[key])
}

/**
 * Inline attachments as base64 data: URLs for the model call.
 *
 * The AI SDK's model-call downloader validates attachment URLs against an
 * SSRF allowlist that rejects localhost, *.local, and private IPs — a local
 * self-hosted deployment is commonly reachable only through such addresses,
 * so an http attachment URL can fail with "URL with hostname … is not allowed".
 * data: URLs are explicitly allowed, so the bytes are fetched same-origin
 * (uploaded-file names carry a random suffix and are unguessable) and inlined.
 * The chip in the composer keeps the http URL for the user.
 */
async function buildFileParts(docs: UploadedDoc[]) {
  return Promise.all(
    docs.map(async (d) => {
      const mediaType =
        d.mimeType ?? (d.kind === "image" ? "image/png" : "application/pdf")
      const res = await fetch(d.url as string)
      if (!res.ok) throw new Error(`attachment fetch failed: ${res.status}`)
      // FileReader base64-encodes off the main thread; the chunked
      // String.fromCharCode + btoa loop this replaced blocked the UI for the
      // whole read on large files. The reader's data URL carries the blob's
      // own content type, but the model-facing part keeps OUR mediaType, so
      // rebuild the URL with it explicitly.
      const blob = await res.blob()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error("attachment read failed"))
        reader.readAsDataURL(blob)
      })
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1)
      return {
        type: "file" as const,
        data: new URL(`data:${mediaType};base64,${base64}`),
        mediaType,
        filename: d.filename,
      }
    })
  )
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
  initialPrompt,
  initialMode = "search",
  initialDocuments = [],
  projectId,
  projectInstructions,
  projectLinks,
}: {
  chatId?: string
  initialEvents?: readonly ChatEvent[]
  initialSession?: SessionState
  initialPrompt?: string
  initialMode?: Mode
  initialDocuments?: readonly UploadedDoc[]
  projectId?: string
  projectInstructions?: string | null
  projectLinks?: string[]
}) {
  const router = useRouter()
  const chatIdRef = useRef<string | undefined>(chatId)
  const createdRef = useRef(false)
  const initialPromptRef = useRef(initialPrompt)
  const initialPromptSubmittedRef = useRef(false)
  // Monotonic per-turn counter: the post-turn refresh only fires for the LATEST
  // turn, so a second turn started before the first one's title generation
  // resolves can't be interrupted mid-stream by the first turn's refresh.
  const turnSeqRef = useRef(0)
  // Synchronous guard for the gap before React commits the optimistic turn.
  // This prevents double Retry/Edit and concurrent composer submissions.
  const replacementLockRef = useRef(false)

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
    resetSession,
    restoreSession,
    supersede,
    commitSupersede,
    unsupersede,
  } = useEveChat({ chatId, initialEvents, initialSession })

  const [input, setInput] = useState("")
  const [mode, setMode] = useState<Mode>(initialMode)
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
    rebindTurnAttachments,
  } = useChatAttachments({
    chatId,
    projectId,
    initialDocuments,
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
        chat?: { id: string; title: string }
        error?: string
      }
      if (!res.ok || !json.chat) {
        toast.error(json.error ?? "Couldn't branch this chat")
        return
      }
      // A client-side route transition preserves the existing layout, so its
      // server-rendered chat list is not fetched again. Surface the newly
      // persisted branch through the same optimistic event used for a new chat.
      window.dispatchEvent(
        chatCreatedEvent({
          id: json.chat.id,
          title: json.chat.title,
          updatedAt: new Date().toISOString(),
        })
      )
      router.push(`/chat/${json.chat.id}`)
    } catch {
      toast.error("Couldn't branch this chat")
    }
  }

  async function submit(
    submitText?: string,
    modelOverride?: string,
    replacement?: {
      retainedMessages: readonly EveMessage[]
      attachments: readonly UploadedDoc[]
      turnIndex: number
      ids: readonly string[]
    }
  ): Promise<boolean> {
    const text = (submitText ?? input).trim()
    const blockedByReplacement = replacementLockRef.current && !replacement
    if (!text || isBusy || blockedByReplacement) return false
    setInput("")
    // Before any await: on a chat's first message `ensureChat` is a round trip,
    // and until this lands the question has vanished from the composer with
    // nothing to show it was received.
    beginTurn(text)

    // Replacement turns must start on a fresh append-only Eve session. Keep
    // the old cursor until the new send is known to have landed so every early
    // failure below can restore the original conversation exactly.
    const previousSession = replacement ? await resetSession() : null
    const restoreReplacedSession = async () => {
      if (previousSession) await restoreSession(previousSession)
    }

    // Staged attachments ride along with THIS message.
    const turnIndex =
      replacement?.turnIndex ?? messages.filter((m) => m.role === "user").length
    const attached = replacement
      ? [...replacement.attachments]
      : attachToTurn(turnIndex)

    const id = await ensureChat(text)
    if (!id) {
      // Nothing was sent, so hand the question back rather than leaving the
      // composer empty with a pending bubble that will never resolve.
      abandonTurn()
      setInput((current) => current || text)
      await restoreReplacedSession()
      toast.error("Couldn't start this chat. Your question is back in the box.")
      return false
    }
    setChatId(id)
    if (!replacement) {
      const bound = await persistTurnBinding(attached, turnIndex)
      if (!bound) {
        abandonTurn()
        setInput((current) => current || text)
        return false
      }
    }

    // The chat row exists in the database now. Surface it in the sidebar
    // immediately without a refresh. chat-list.tsx listens for these events
    // and inserts/updates the row optimistically while the App Router performs
    // the canonical route transition above.
    // The first event shows the row (question text as a placeholder title);
    // the second swaps in the generated title, which is produced in parallel
    // with the turn instead of waiting for the whole response to finish.
    if (createdRef.current) {
      createdRef.current = false
      window.dispatchEvent(
        chatCreatedEvent({
          id,
          title: text.slice(0, 80),
          updatedAt: new Date().toISOString(),
        })
      )
      void fetch(`/api/chats/${id}/title`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      })
        .then((res) => res.json().catch(() => null))
        .then((json: { title?: string } | null) => {
          if (json?.title) {
            window.dispatchEvent(chatTitledEvent(id, json.title))
          }
        })
        .catch(() => {})

      // A brand-new conversation starts on its real App Router route. The
      // destination consumes q exactly once and owns the Eve session from the
      // first send, so no live transport is abandoned during navigation and no
      // root-page tree is left mounted under a /chat/:id URL.
      router.replace(chatTurnPath(id, text, mode))
      return true
    }

    // Attachments ride to the model natively as file parts — eve's message
    // schema only accepts "text"/"file" (no separate "image" part type);
    // models with vision read image-mediaType file parts directly. Documents
    // are ALSO indexed for search_documents, so they stay searchable across chats.
    // The model-facing part is a data: URL — buildFileParts inlines the bytes
    // because the SDK refuses http attachments from private hosts (see above).
    const attachable = attached.filter(
      (d) => d.url && (d.kind === "image" || d.mimeType === "application/pdf")
    )
    let fileParts: Awaited<ReturnType<typeof buildFileParts>> | null = null
    if (attachable.length > 0) {
      try {
        fileParts = await buildFileParts(attachable)
      } catch {
        abandonTurn()
        setInput((current) => current || text)
        await restoreReplacedSession()
        toast.error(
          "Couldn't read the attachment. Your question is back in the box."
        )
        return false
      }
    }

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
    const recapMessages = replacement?.retainedMessages ?? messages
    const recap = () =>
      recapMessages.length === 0 ? null : conversationRecap(recapMessages)

    const myTurn = ++turnSeqRef.current
    let accepted = false
    const sent = await send({
      optimisticText: text,
      message:
        fileParts && fileParts.length > 0
          ? [{ type: "text", text }, ...fileParts]
          : text,
      clientContext: context(hasSession() ? null : recap()),
      freshContext: () => context(recap()),
      onAccepted: replacement
        ? () => {
            if (accepted) return
            accepted = true
            commitSupersede(replacement.ids)
            rebindTurnAttachments(
              replacement.attachments,
              replacement.turnIndex
            )
          }
        : undefined,
    })

    // A send that never landed leaves the reader with an empty composer and no
    // answer coming. Put the question back so retrying is one keystroke, not a
    // retype — `send` has already explained what went wrong.
    if (!sent) setInput((current) => current || text)
    if (!accepted) await restoreReplacedSession()

    if (sent && myTurn === turnSeqRef.current) {
      // Turn finished, stream complete — safe to re-sync the sidebar from the
      // server now (title, ordering). For a brand-new chat this also swaps the
      // home page onto the /chat/<id> route with the finished turn rendered.
      // Guarded by the turn counter so this never fires while a NEWER turn is
      // streaming (the refresh would remount the conversation mid-stream).
      router.refresh()
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

  useMountEffect(() => {
    const prompt = initialPromptRef.current
    if (!prompt || initialPromptSubmittedRef.current) return
    initialPromptSubmittedRef.current = true
    // Consume the query before `submit` reaches its first await. A remount or
    // refresh during chat creation therefore cannot submit the shared URL a
    // second time. `submit` itself restores the prompt if creation/send fails.
    window.history.replaceState(
      null,
      "",
      withoutInitialQuery(window.location.href)
    )
    void submitRef.current(prompt)
  })

  /**
   * Replace a turn from any user message: hide that question and every visible
   * message after it, reset eve's append-only session, then ask again from the
   * retained prefix. Passing `text` edits the question; omitting it retries it.
   *
   * eve sessions are append-only, so "delete" here means marking those messages
   * superseded (persisted once the new turn starts) rather than stacking a
   * second answer under the first.
   */
  const replaceTurn = async (
    questionIndex: number,
    text?: string,
    modelId?: string
  ) => {
    if (isBusy || replacementLockRef.current) return
    const question = messages[questionIndex]
    if (question?.role !== "user") return
    const next = text ?? partText(question.parts, "text")
    if (!next) return
    const ids = replacementMessageIds(messages, questionIndex, supersededIds)
    const retainedMessages = messagesBeforeReplacement(
      messages,
      questionIndex,
      supersededIds
    )
    const sourceTurnIndex = userTurnOf[questionIndex]
    const turnIndex = nextReplacementTurnIndex(messages, userTurnOf)
    const attachments = attachmentsByTurn[sourceTurnIndex] ?? []
    replacementLockRef.current = true
    supersede(ids)
    try {
      const sent = await submit(next, modelId, {
        retainedMessages,
        attachments,
        turnIndex,
        ids,
      })
      if (!sent) unsupersede(ids)
    } finally {
      replacementLockRef.current = false
    }
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
                                onRetry={
                                  !isBusy
                                    ? () => void replaceTurn(i)
                                    : undefined
                                }
                                onEdit={
                                  !isBusy
                                    ? (next) => void replaceTurn(i, next)
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
                                        void replaceTurn(
                                          i - 1,
                                          undefined,
                                          modelId
                                        )
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
