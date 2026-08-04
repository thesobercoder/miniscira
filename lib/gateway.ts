// Server-side only: builds OpenAI-compatible models routed through the
// deployment's own AI gateway (CLIProxyAPI by default). Shared by the root
// agent, the researcher subagent, and image generation.
//
// eve classifies any *string* model id as a Vercel AI Gateway route, so every
// model definition here is a LanguageModel/ImageModel instance — that keeps
// eve's routing "external" and off the Vercel gateway entirely.

import { createOpenAI } from "@ai-sdk/openai"

import { gatewayBaseUrl } from "./gateway-models"

export function chatModel(modelId: string, apiKey?: string) {
  return createOpenAI({
    baseURL: gatewayBaseUrl(),
    apiKey: apiKey ?? process.env.AI_GATEWAY_API_KEY ?? "",
  }).chat(modelId)
}

export function imageModel(modelId: string) {
  return createOpenAI({
    baseURL: gatewayBaseUrl(),
    apiKey: process.env.AI_GATEWAY_API_KEY ?? "",
  }).image(modelId)
}
