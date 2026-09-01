# Long-conversation compaction

## Caller usage

A caller with a valid Eve cursor resumes that session. MiniScira does not rebuild or resend history.

A caller that needs a fresh Eve session asks the server for one bootstrap checkpoint. The server projects the current visible transcript from durable `chat_event` rows, selects the latest checkpoint whose message-prefix digest still matches, compacts the remaining tail, and persists the new checkpoint. The client prefixes the returned checkpoint to the first real user message in a machine-owned envelope. The UI removes that envelope before rendering. Eve persists the complete message and its normal in-session compactor owns every later turn.

A retry or edit first persists its supersede event. Its new prefix no longer matches a checkpoint that covered discarded messages, so the server regenerates from the retained prefix. A branch has no Eve cursor and obtains a checkpoint from the copied event history on its first turn.

## Domain model

```ts
interface ConversationCheckpoint {
  id: string
  chatId: string
  version: 1
  coveredMessageCount: number
  coveredMessageDigest: string
  summary: string
  createdAt: Date
}

interface BootstrapContext {
  checkpointId: string
  coveredMessageCount: number
  coveredMessageDigest: string
  summary: string
}
```

`coveredMessageDigest` is a SHA-256 digest of the ordered visible message IDs through `coveredMessageCount`. The pair binds a model summary to one exact retained prefix. An incompatible checkpoint is ignored. The raw event log remains the durable conversation truth.

A checkpoint is stored in a separate table. It is not inserted into `chat_event` because Eve replays those rows as protocol events and does not accept an application checkpoint event.

## Public functions

```ts
function projectVisibleMessages(events: readonly ChatEvent[]): readonly EveMessage[]

function digestMessagePrefix(
  messages: readonly EveMessage[],
  count?: number
): string

function selectCompatibleCheckpoint(
  messages: readonly EveMessage[],
  checkpoints: readonly ConversationCheckpoint[]
): ConversationCheckpoint | null

function serializeCompactionUnits(
  messages: readonly EveMessage[]
): readonly string[]

function packCompactionUnits(
  units: readonly string[],
  maxChars: number
): readonly string[]

async function compactBootstrap(input: {
  priorSummary?: string
  chunks: readonly string[]
  model: LanguageModel
}): Promise<string>

function wrapBootstrapMessage(
  message: UserContent,
  checkpoint: BootstrapContext
): UserContent

function stripBootstrapEnvelope(text: string): string
```

The server route is `POST /api/chats/:id/checkpoint`. It authenticates the user, loads only their chat, projects stored events, reuses a compatible checkpoint, compacts every uncovered unit in bounded sequential chunks, inserts the result idempotently by `(chat_id, covered_message_digest)`, and returns the canonical stored row.

## Module map

- `lib/chat-projection.ts` owns pure event-to-visible-message projection. The React hook delegates to it.
- `lib/conversation-checkpoint.ts` owns checkpoint selection, message-prefix hashing, transcript serialization, chunk packing, and message-envelope parsing.
- `lib/conversation-compaction.ts` owns the server-only model loop and checkpoint persistence.
- `app/api/chats/[id]/checkpoint/route.ts` owns authentication and HTTP validation.
- `hooks/use-eve-chat.ts` requests a checkpoint only when Eve confirms that the stored session is unavailable or when no session exists.
- `lib/db/schema.ts` and migration `0005_conversation_checkpoint.sql` own durable checkpoint rows.

## Synthesis decision

MiniScira owns bootstrap checkpoints now. Eve 0.29.4 already owns normal durable compaction for resumable sessions, but it exposes neither its summary nor a supported session-fork or history-import API. A private Eve import would be brittle. Waiting for an Eve API would leave the release blocker open.

The staged 48,000-character recap serializer is rejected as the primary design. Sampling raw history cannot guarantee coverage and recreates compaction policy inside a string clipper. Its safe part rendering can be reused as input serialization, but every serialized unit must enter a model chunk. No message-count sampling is allowed.

An Eve-native `fork()` or exported compaction checkpoint remains the preferred future simplification. When Eve exposes it, MiniScira can migrate callers and delete the application-owned compactor.

## Verification contract

The implementation is not complete until all of these pass:

1. The committed red fixture loses early and middle facts on the old fresh-session path.
2. Every source unit is covered exactly once by the chunk packer, including oversized multipart messages.
3. A checkpoint is reused only when its ordered visible-prefix digest matches.
4. Retry and edit checkpoints exclude the selected question and every later superseded message.
5. A branch generates or reuses a checkpoint from its copied history without sharing the source Eve cursor.
6. The first fresh-session user message contains the checkpoint, while the rendered user text does not.
7. The second turn of that Eve session recalls the sentinel facts without resending the checkpoint.
8. Reload and restart resume the original Eve cursor and do not call the bootstrap endpoint.
9. Tools, citations, and attachment identity survive compaction. Credential-shaped values are replaced by `[REDACTED]` before model input.
10. TypeScript, focused tests, the full suite, production build, migration checks, authenticated Eve compaction, and the real browser branch/recovery path pass.
