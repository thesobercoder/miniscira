// The models users can pick in the composer. All are AI Gateway ids served with
// the existing AI_GATEWAY_API_KEY — no extra provider keys. Every entry must
// support vision + tool use (attachments and the research tools rely on both).
export type ChatModel = {
  id: string
  name: string
  vendor: string
  hint: string
}

// Also the dynamic fallback in agent/agent.ts and the researcher subagent's
// model, so it has to survive long multi-tool turns. gemini-3.5-flash-lite did
// not: 4 of its 10 sessions died at the step following a multi-tool-call step
// with an AI Gateway 400 ("Corrupted thought signature", under it "the number of
// function response parts is equal to the number of function call parts"),
// while grok and sonnet went 0/67. Keep this on a model with a clean record.
export const DEFAULT_CHAT_MODEL = "xai/grok-4.20-reasoning"

export const CHAT_MODELS: ChatModel[] = [
  {
    id: "xai/grok-4.20-reasoning",
    name: "Grok 4.20",
    vendor: "xAI",
    hint: "Fast reasoning · default",
  },
  {
    id: "anthropic/claude-sonnet-5",
    name: "Claude Sonnet 5",
    vendor: "Anthropic",
    hint: "Strong writing & analysis",
  },
  {
    id: "openai/gpt-5.5",
    name: "GPT-5.5",
    vendor: "OpenAI",
    hint: "All-round flagship",
  },
  {
    id: "google/gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    vendor: "Google",
    hint: "Fastest & cheapest",
  },
]

// Loose shape check for a gateway model id ("provider/model"). The router
// additionally validates picked ids against the live gateway catalog.
export const MODEL_ID_RE = /^[a-z0-9-]+\/[a-z0-9._:-]+$/i

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

/** Featured providers listed first in the picker; the rest follow alphabetically. */
export const PROVIDER_ORDER = ["xai", "anthropic", "openai", "google"]

/** Provider slug of a `provider/model` gateway id: `openai/gpt-5` → `openai`. */
export function providerOf(id: string): string {
  return id.split("/")[0]
}

export function providerLabel(provider: string): string {
  return (
    PROVIDERS[provider]?.name ??
    provider.charAt(0).toUpperCase() + provider.slice(1)
  )
}

/**
 * Human name for a model id when no catalog name is available (featured lookup,
 * then a prettified id tail). Prefer the catalog `name` wherever we have it.
 */
export function shortModelName(id: string): string {
  const featured = CHAT_MODELS.find((m) => m.id === id)?.name
  if (featured) return featured
  const tail = id.split("/")[1] || id
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
