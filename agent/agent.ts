import { chatModel } from "@/lib/gateway"
import { defineAgent, defineDynamic } from "eve"

import {
  type GatewayCredential,
  gatewayCredentialFor,
  NoGatewayCredentialError,
} from "@/lib/gateway-credentials"
import { contextWindowFor } from "@/lib/gateway-models"
import { DEFAULT_CHAT_MODEL, MODEL_ID_RE } from "@/lib/models"

/**
 * The gateway credential for whoever this turn belongs to.
 *
 * The principal comes from the channel's auth chain (agent/channels/eve.ts), so
 * a browser turn resolves to the signed-in user and a headless lookout run to
 * the owner the internal-run secret named. Anything else — a principal with no
 * user id — has nobody to bill and gets nothing.
 */
async function turnCredential(ctx: {
  session?: {
    auth?: {
      current?: {
        principalType?: string
        principalId?: string
      } | null
    }
  }
}): Promise<GatewayCredential | null> {
  const principal = ctx.session?.auth?.current
  if (principal?.principalType !== "user" || !principal.principalId) return null
  try {
    return await gatewayCredentialFor(principal.principalId)
  } catch {
    return null
  }
}

// Matches the JSON-serialized clientContext, e.g. {"chatModel":"openai/gpt-5.5"}.
// The client sends clientContext.chatModel with each message; eve serializes it
// into a user-role context message, so the latest marker in the transcript is
// the user's current pick for this turn.
const MARKER = /"chatModel"\s*:\s*"([\w.:/-]+)"/g

/** The text of one message, whether its content is a string or a part array. */
function textOf(message: unknown): string {
  const content = (message as { content?: unknown })?.content
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .map((part) =>
      typeof (part as { text?: unknown })?.text === "string"
        ? String((part as { text: string }).text)
        : ""
    )
    .join("\n")
}

/**
 * The user's model pick for this turn, or null.
 *
 * Reads each message's TEXT rather than `JSON.stringify`-ing the array. eve
 * serializes clientContext into the body of a user message — the content is the
 * literal string `Client context:\n{"chatModel":"..."}` — so stringifying the
 * array escapes those inner quotes to `\"` and a `"chatModel"` pattern no longer
 * matches. That bug made this function return null for every turn, which meant
 * the compiled fallback silently answered every chat regardless of the picker.
 */
function chatModelFromMessages(messages: unknown): string | null {
  if (!Array.isArray(messages)) return null
  let candidate: string | null = null
  for (const message of messages) {
    for (const match of textOf(message).matchAll(MARKER)) {
      if (MODEL_ID_RE.test(match[1])) candidate = match[1]
    }
  }
  return candidate
}

export default defineAgent({
  // Per-turn model: whatever the user picked in the composer, always.
  //
  // `fallback` is a REQUIRED field of defineDynamic — it is the compiled
  // build-time model (context window, routing) and the model for turns that
  // carry no pick at all: subagents and headless lookout runs. It is no longer
  // a *fallback* in the behavioural sense.
  //
  // The validation gate that used to sit here is gone on purpose. It resolved a
  // pick it could not verify — a cold gateway-catalog cache, a transient fetch
  // failure — by silently returning null and running the turn on a different
  // model than the composer was showing. That is how research turns ended up on
  // gemini-3.5-flash-lite while the picker read "Ling 3.0 Flash", and it made
  // the resulting failures almost impossible to attribute. A pick is now
  // honoured as sent; a genuinely bad id fails loudly on the model call, which
  // the turn already surfaces as a failed-turn note.
  //
  // Resolved on `step.started`, NOT `turn.started`: at turn.started `ctx.messages`
  // is still empty, so there is no clientContext to read and every turn would
  // fall through to the compiled model. Measured, not assumed.
  //
  // The resolver also decides *whose* gateway credential pays. It returns a
  // `LanguageModel` instance rather than a model id string — eve accepts either
  // (`PublicAgentStaticModelDefinition = string | LanguageModel`) — built from
  // the key that caller saved in Settings, decrypted for this turn (or the
  // deployment's shared AI_GATEWAY_API_KEY when no per-user key is set). So a
  // turn bills the user's own gateway key, not a pooled one. Nothing here reads
  // an OAuth token: the provider sign-in is identity only.
  model: defineDynamic({
    fallback: chatModel(DEFAULT_CHAT_MODEL),
    events: {
      "step.started": async (_event, ctx) => {
        const modelId =
          chatModelFromMessages(ctx.messages) ?? DEFAULT_CHAT_MODEL
        const credential = await turnCredential(ctx)
        // No credential and no shared-key escape hatch: fail here rather than
        // fall through to `fallback`, which would run the turn on the
        // deployment's own key — the exact thing this is meant to prevent.
        if (!credential) throw new NoGatewayCredentialError()

        return {
          // Model built against the deployment's own OpenAI-compatible gateway
          // (CLIProxyAPI by default) — see lib/gateway.ts. The caller's saved
          // key (or the shared AI_GATEWAY_API_KEY) bills the turn.
          model: chatModel(modelId, credential.apiKey),
          // Undefined when the catalog can't answer; eve then keeps the
          // compiled window rather than guessing one.
          // Same key the turn runs on, so the catalog can be primed even when
          // the deployment holds no gateway key of its own.
          modelContextWindowTokens: await contextWindowFor(
            modelId,
            credential.apiKey
          ),
        }
      },
    },
  }),

  // CPA models carry no AI Gateway metadata, so eve would otherwise fail the
  // build trying to look up a context window for the fallback model. Setting
  // the window explicitly skips that lookup (eve's documented escape hatch for
  // custom/unlisted models) and keeps the build fully self-hosted.
  modelContextWindowTokens: 200_000,

  compaction: {
    thresholdPercent: 0.85,
    modelContextWindowTokens: 200_000,
    // Run the summary pass on a fast, cheap, large-context model rather than the
    // active turn model (eve's default). Without this, every compaction bills
    // its summary at flagship rates; Gemini 3 Flash summarizes long transcripts
    // well and has the window to hold them. A LanguageModel instance — never a
    // string, which eve would route through the (cloud) gateway.
    model: chatModel("gemini-3-flash"),
  },
  limits: {
    // Cost guard: a session that has produced 200K output tokens pauses with
    // eve's built-in Continue/Stop prompt instead of running away silently.
    maxOutputTokensPerSession: 200_000,
    // The output cap alone doesn't bound spend on a research agent: a deep
    // report re-reads a growing transcript plus fetched pages every step, so
    // input dominates the bill. eve's default is 40M, which is ~160 turns at
    // the ~250K a deep-research turn actually costs here. 10M keeps a runaway
    // session to roughly 40 such turns before it has to ask.
    maxInputTokensPerSession: 10_000_000,
    // Explicit rather than inherited. eve 0.28 started completing sessions after
    // 30 days by default, and a research chat is exactly the thing someone opens
    // again months later. 180 days keeps those continuable; when it does expire,
    // the chat falls back to the conversationRecap path like a branched chat.
    sessionTimeoutMs: 180 * 24 * 60 * 60 * 1000,
  },
})
