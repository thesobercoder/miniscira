// The models users can pick in the composer. All are served by the
// deployment's own OpenAI-compatible AI gateway with the caller's own key —
// no per-provider keys. The live gateway catalog (/v1/models) is the only
// source of model records; nothing here maps ids to vendors.

// The built-in default, used when neither DEFAULT_CHAT_MODEL nor
// NEXT_PUBLIC_DEFAULT_CHAT_MODEL is set (or the value is invalid). The ONLY
// hardcoded model id in the default-resolution path.
const BUILTIN_DEFAULT_CHAT_MODEL = "gpt-5.6-sol"

// Loose shape check for a model id. The gateway serves bare ids (no
// provider/ prefix), so a slash is optional.
export const MODEL_ID_RE = /^[a-z0-9][a-z0-9._:-]*(\/[a-z0-9._:-]+)?$/i

/**
 * The single resolution point for the default chat model (Phase 3).
 *
 * Runtime `DEFAULT_CHAT_MODEL` wins on the server (eve agent, Next server,
 * model router). `NEXT_PUBLIC_DEFAULT_CHAT_MODEL` is the build-time constant
 * Next inlines into the client bundle, so the picker's default matches the
 * server's even though client code cannot read runtime env. Checking the
 * runtime value first keeps a deployment that only sets DEFAULT_CHAT_MODEL
 * (no rebuild) in control of the server-side default.
 *
 * Invalid values fall back to the built-in with a warning instead of breaking
 * boot — a bad env value must not take the whole app down.
 */
export function resolveDefaultChatModel(): string {
  const fromEnv =
    process.env.DEFAULT_CHAT_MODEL ?? process.env.NEXT_PUBLIC_DEFAULT_CHAT_MODEL
  if (fromEnv && MODEL_ID_RE.test(fromEnv)) return fromEnv
  if (fromEnv) {
    console.warn(
      `[models] DEFAULT_CHAT_MODEL "${fromEnv}" is not a valid model id — ` +
        `using "${BUILTIN_DEFAULT_CHAT_MODEL}" instead`
    )
  }
  return BUILTIN_DEFAULT_CHAT_MODEL
}

// Also the dynamic fallback in agent/agent.ts and the researcher subagent's
// model, so it has to survive long multi-tool turns.
export const DEFAULT_CHAT_MODEL = resolveDefaultChatModel()

/**
 * Provider display names + logos, self-hosted under /public/providers (pulled
 * from svgl.app). Monochrome marks need a variant per theme: `icon` shows in
 * light mode, `iconDark` in dark mode. Colorful marks (Gemini, DeepSeek, Meta…)
 * work on both and set only `icon`. Providers the gateway serves without a brand
 * mark carry a name only and fall back to a generic glyph in the picker.
 */
export const PROVIDERS: Record<
  string,
  { name: string; icon?: string; iconDark?: string }
> = {
  xai: {
    name: "xAI",
    icon: "/providers/xai.svg",
    iconDark: "/providers/xai-dark.svg",
  },
  anthropic: {
    name: "Anthropic",
    icon: "/providers/anthropic.svg",
    iconDark: "/providers/anthropic-dark.svg",
  },
  openai: {
    name: "OpenAI",
    icon: "/providers/openai.svg",
    iconDark: "/providers/openai-dark.svg",
  },
  google: { name: "Google", icon: "/providers/google.svg" },
  meta: { name: "Meta", icon: "/providers/meta.svg" },
  mistral: { name: "Mistral", icon: "/providers/mistral.svg" },
  deepseek: { name: "DeepSeek", icon: "/providers/deepseek.svg" },
  alibaba: {
    name: "Alibaba",
    icon: "/providers/alibaba.svg",
    iconDark: "/providers/alibaba-dark.svg",
  },
  moonshotai: { name: "Moonshot", icon: "/providers/moonshotai.svg" },
  cohere: { name: "Cohere", icon: "/providers/cohere.svg" },
  nvidia: {
    name: "NVIDIA",
    icon: "/providers/nvidia.svg",
    iconDark: "/providers/nvidia-dark.svg",
  },
  amazon: {
    name: "Amazon",
    icon: "/providers/amazon.svg",
    iconDark: "/providers/amazon-dark.svg",
  },
  // Brand-colour marks from Simple Icons (single colour, fine on both themes).
  minimax: { name: "MiniMax", icon: "/providers/minimax.svg" },
  bytedance: { name: "ByteDance", icon: "/providers/bytedance.svg" },
  xiaomi: { name: "Xiaomi", icon: "/providers/xiaomi.svg" },
  // Marks pulled from each provider's own site (logo / favicon).
  zai: { name: "Z.ai", icon: "/providers/zai.svg" },
  tencent: { name: "Tencent", icon: "/providers/tencent.svg" },
  stepfun: { name: "StepFun", icon: "/providers/stepfun.svg" },
  kwaipilot: { name: "Kwaipilot", icon: "/providers/kwaipilot.png" },
  "arcee-ai": { name: "Arcee AI", icon: "/providers/arcee-ai.ico" },
  sakana: { name: "Sakana AI", icon: "/providers/sakana.ico" },
  poolside: { name: "Poolside", icon: "/providers/poolside.ico" },
  inception: { name: "Inception", icon: "/providers/inception.png" },
  thinkingmachines: {
    name: "Thinking Machines",
    icon: "/providers/thinkingmachines.png",
  },
  interfaze: { name: "Interfaze", icon: "/providers/interfaze.svg" },
}

/** Vendor slug of a model id: `openai/gpt-5` → `openai`; bare ids → `unknown`. */
export function providerOf(id: string): string {
  const slash = id.indexOf("/")
  if (slash > 0) return id.slice(0, slash).toLowerCase()
  return "unknown"
}

export function providerLabel(provider: string): string {
  return (
    PROVIDERS[provider]?.name ??
    provider.charAt(0).toUpperCase() + provider.slice(1)
  )
}

/**
 * Human name for a model id when no catalog name is available: the prettified
 * id tail (`openai/gpt-5` → `Gpt 5`). Prefer the catalog `name` wherever we
 * have it.
 */
export function shortModelName(id: string): string {
  const tail = id.split("/").at(-1) ?? id
  return tail
    .split("-")
    .map((w) =>
      /^(gpt|glm|oss)$/i.test(w)
        ? w.toUpperCase()
        : /^v?\d/.test(w)
          ? w
          : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(" ")
}

export function formatContext(tokens: number): string {
  if (tokens >= 1_000_000)
    return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 ? 1 : 0)}M`
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`
  return String(tokens)
}
