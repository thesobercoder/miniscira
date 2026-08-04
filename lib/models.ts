// The models users can pick in the composer. All are served by the
// deployment's own OpenAI-compatible AI gateway (CLIProxyAPI by default) with
// the shared AI_GATEWAY_API_KEY — no per-provider keys. Every entry must
// support vision + tool use (attachments and the research tools rely on both).
export type ChatModel = {
  id: string
  name: string
  vendor: string
  hint: string
}

// Also the dynamic fallback in agent/agent.ts and the researcher subagent's
// model, so it has to survive long multi-tool turns.
export const DEFAULT_CHAT_MODEL = "gpt-5.6-sol"

export const CHAT_MODELS: ChatModel[] = [
  {
    id: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    vendor: "openai",
    hint: "Flagship reasoning · default",
  },
  {
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    vendor: "anthropic",
    hint: "Strong writing & analysis",
  },
  {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash",
    vendor: "google",
    hint: "Fast & cheap",
  },
  {
    id: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    vendor: "openai",
    hint: "Routine reasoning",
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    vendor: "deepseek",
    hint: "Deep research",
  },
  {
    id: "claude-opus-5",
    name: "Claude Opus 5",
    vendor: "anthropic",
    hint: "Heavy lifting",
  },
  {
    id: "glm-5.2",
    name: "GLM 5.2",
    vendor: "zai",
    hint: "Versatile all-rounder",
  },
  {
    id: "qwen3.8-max",
    name: "Qwen 3.8 Max",
    vendor: "alibaba",
    hint: "Long context",
  },
]

// Loose shape check for a model id. The gateway serves bare ids (no
// provider/ prefix), so a slash is optional.
export const MODEL_ID_RE = /^[a-z0-9][a-z0-9._:-]*(\/[a-z0-9._:-]+)?$/i

// Bare model id -> provider slug, for ids the gateway serves without a
// provider/ prefix. Everything CLIProxyAPI exposes maps to a real vendor.
export const MODEL_VENDOR: Record<string, string> = {
  // OpenAI
  "gpt-5.6-sol": "openai",
  "gpt-5.6-luna": "openai",
  "gpt-5.6-terra": "openai",
  "gpt-5.5": "openai",
  "gpt-5.4": "openai",
  "gpt-5.4-mini": "openai",
  "gpt-image-2": "openai",
  "gpt-image-1.5": "openai",
  // Anthropic
  "claude-sonnet-5": "anthropic",
  "claude-sonnet-4-6": "anthropic",
  "claude-opus-5": "anthropic",
  "claude-opus-4-8": "anthropic",
  "claude-opus-4-6-thinking": "anthropic",
  "claude-haiku-4-5-20251001": "anthropic",
  "claude-fable-5": "anthropic",
  // Google
  "gemini-3-flash": "google",
  "gemini-3-flash-agent": "google",
  "gemini-3.1-flash-lite": "google",
  "gemini-3.1-flash-image": "google",
  "gemini-3.6-flash-high": "google",
  "gemini-pro-agent": "google",
  // DeepSeek
  "deepseek-v4-flash": "deepseek",
  "deepseek-v4-pro": "deepseek",
  // xAI
  "grok-4.5": "xai",
  "grok-composer-2.5-fast": "xai",
  "grok-imagine-image": "xai",
  "grok-imagine-image-quality": "xai",
  "grok-imagine-video": "xai",
  "grok-imagine-video-1.5": "xai",
  "grok-imagine-video-1.5-preview": "xai",
  // Z.ai / Alibaba / Moonshot
  "glm-5.2": "zai",
  "qwen3.7-plus": "alibaba",
  "qwen3.8-max": "alibaba",
  "kimi-k3": "moonshotai",
}

const VENDOR_SLUGS = new Set([
  "xai",
  "anthropic",
  "openai",
  "google",
  "meta",
  "mistral",
  "deepseek",
  "alibaba",
  "moonshotai",
  "cohere",
  "nvidia",
  "amazon",
  "minimax",
  "bytedance",
  "xiaomi",
  "zai",
  "tencent",
  "stepfun",
  "kwaipilot",
])

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
  // The gateway itself, when an id doesn't map to a branded vendor.
  cpa: { name: "CLIProxyAPI" },
}

/** Featured providers listed first in the picker; the rest follow alphabetically. */
export const PROVIDER_ORDER = [
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "xai",
  "zai",
  "alibaba",
  "moonshotai",
]

/** Provider slug of a model id: `openai/gpt-5` → `openai`, `gpt-5.6-sol` → `openai`. */
export function providerOf(id: string): string {
  if (MODEL_VENDOR[id]) return MODEL_VENDOR[id]
  const head = id.split("/")[0]
  if (VENDOR_SLUGS.has(head)) return head
  return MODEL_VENDOR[head] ?? "cpa"
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
