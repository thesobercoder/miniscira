// Server-side only: builds OpenAI-compatible models routed through the
// deployment's own AI gateway (CLIProxyAPI by default). Shared by the root
// agent, the researcher subagent, and image generation.
//
// eve classifies any *string* model id as a Vercel AI Gateway route, so every
// model definition here is a LanguageModel/ImageModel instance — that keeps
// eve's routing "external" and off the Vercel gateway entirely.

import { createOpenAI } from "@ai-sdk/openai"
import { APICallError } from "@ai-sdk/provider"

import { gatewayBaseUrl } from "./gateway-models"

type CountMap = Record<string, number>

export type WireRequestShape = {
  roleCounts: CountMap
  partTypeCounts: CountMap
  files: Array<{
    mediaType: string
    byteSize?: number
  }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function increment(counts: CountMap, key: string) {
  counts[key] = (counts[key] ?? 0) + 1
}

function sortedCounts(counts: CountMap): CountMap {
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))
  )
}

function base64ByteSize(value: string): number | undefined {
  const encoded = value.startsWith("data:")
    ? value.match(/^data:[^,]*;base64,([A-Za-z0-9+/]*={0,2})$/)?.[1]
    : value

  if (
    encoded === undefined ||
    encoded.length === 0 ||
    encoded.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      encoded
    )
  ) {
    return undefined
  }

  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0
  return (encoded.length / 4) * 3 - padding
}

function fileByteSize(data: unknown): number | undefined {
  if (!isRecord(data)) return undefined

  if (data.type === "data") {
    if (data.data instanceof Uint8Array) return data.data.byteLength
    if (typeof data.data === "string") return base64ByteSize(data.data)
  }

  if (data.type === "url" && data.url instanceof URL) {
    return base64ByteSize(data.url.href)
  }

  return undefined
}

export function summarizeLanguageModelRequest(
  options: unknown
): WireRequestShape | undefined {
  if (!isRecord(options) || !Array.isArray(options.prompt)) return undefined

  const roleCounts: CountMap = {}
  const partTypeCounts: CountMap = {}
  const files: WireRequestShape["files"] = []

  for (const message of options.prompt) {
    if (!isRecord(message) || typeof message.role !== "string") continue
    increment(roleCounts, message.role)

    if (message.role === "system" && typeof message.content === "string") {
      increment(partTypeCounts, "text")
      continue
    }
    if (!Array.isArray(message.content)) continue

    for (const part of message.content) {
      if (!isRecord(part) || typeof part.type !== "string") continue
      increment(partTypeCounts, part.type)
      if (
        (part.type === "file" || part.type === "reasoning-file") &&
        typeof part.mediaType === "string"
      ) {
        const byteSize = fileByteSize(part.data)
        files.push({
          mediaType: part.mediaType,
          ...(byteSize === undefined ? {} : { byteSize }),
        })
      }
    }
  }

  return {
    roleCounts: sortedCounts(roleCounts),
    partTypeCounts: sortedCounts(partTypeCounts),
    files,
  }
}

function wireLogAttempt(
  requestId: string,
  modelId: string,
  attempt: number,
  requestShape: WireRequestShape | undefined
) {
  if (process.env.MINISCIRA_WIRE_LOG !== "1" || requestShape === undefined)
    return

  console.debug(
    JSON.stringify({ requestId, attempt, modelId, ...requestShape })
  )
}

function exhaustedRetry(error: APICallError): APICallError {
  return new APICallError({
    message: "Model request failed after retry.",
    url: error.url,
    requestBodyValues: error.requestBodyValues,
    statusCode: error.statusCode,
    responseHeaders: error.responseHeaders,
    responseBody: error.responseBody,
    cause: error,
    isRetryable: false,
    data: error.data,
  })
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
        const requestId = crypto.randomUUID()
        const requestShape = summarizeLanguageModelRequest(args[0])
        for (let attempt = 1; attempt <= 2; attempt++) {
          wireLogAttempt(requestId, target.modelId, attempt, requestShape)
          try {
            return await Reflect.apply(value, target, args)
          } catch (error) {
            if (!APICallError.isInstance(error) || !error.isRetryable) throw error
            if (attempt === 2) throw exhaustedRetry(error)
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
  return createOpenAI({
    baseURL: gatewayBaseUrl(),
    apiKey: process.env.AI_GATEWAY_API_KEY ?? "",
  }).image(modelId)
}
