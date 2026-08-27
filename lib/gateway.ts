// Server-side only: builds OpenAI-compatible models routed through the
// deployment's own AI gateway (CLIProxyAPI by default). Shared by the root
// agent, the researcher subagent, and image generation.
//
// eve classifies any *string* model id as a Vercel AI Gateway route, so every
// model definition here is a LanguageModel/ImageModel instance — that keeps
// eve's routing "external" and off the Vercel gateway entirely.

import { createOpenAI } from "@ai-sdk/openai"

import { gatewayBaseUrl } from "./gateway-models"

const WIRE_LOG = process.env.MINISCIRA_WIRE_LOG === "1"

function errorDetails(error: unknown) {
  return {
    errorName: error instanceof Error ? error.name : typeof error,
    message: String(error instanceof Error ? error.message : error).slice(
      0,
      200
    ),
  }
}

function shouldRetry(error: unknown) {
  return error instanceof Error && error.name === "AI_APICallError"
}

export function withOneRetry<T extends { readonly modelId: string }>(
  model: T
): T {
  return new Proxy(model, {
    get(target, property) {
      const value = Reflect.get(target, property, target)
      if (typeof value !== "function") return value
      if (property !== "doGenerate" && property !== "doStream")
        return value.bind(target)

      return async (...args: unknown[]) => {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const result = await Reflect.apply(value, target, args)
            if (WIRE_LOG)
              console.debug(
                JSON.stringify({ modelId: target.modelId, ok: true })
              )
            return result
          } catch (error) {
            if (WIRE_LOG)
              console.warn(
                JSON.stringify({
                  modelId: target.modelId,
                  attempt,
                  ...errorDetails(error),
                })
              )
            if (attempt === 2 || !shouldRetry(error)) throw error
          }
        }
      }
    },
  })
}

export function chatModel(modelId: string, apiKey?: string) {
  return withOneRetry(
    createOpenAI({
      baseURL: gatewayBaseUrl(),
      apiKey: apiKey ?? process.env.AI_GATEWAY_API_KEY ?? "",
    }).chat(modelId)
  )
}

export function imageModel(modelId: string) {
  return withOneRetry(
    createOpenAI({
      baseURL: gatewayBaseUrl(),
      apiKey: process.env.AI_GATEWAY_API_KEY ?? "",
    }).image(modelId)
  )
}
