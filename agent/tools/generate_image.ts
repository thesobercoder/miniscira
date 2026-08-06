import { generateImage } from "ai"
import { defineTool } from "eve/tools"
import { z } from "zod"

import { imageModel } from "@/lib/gateway"
import { put } from "@/lib/local-blob"

// The model sees this tool as `generate_image`, from the filename. It renders in
// the timeline as the AIcss image-generation canvas (a shimmering placeholder
// with the prompt) while running, and swaps to the finished picture on success.
//
// Self-hosted: the image model is served by the deployment's own AI gateway
// (CLIProxyAPI) and the result is stored locally. Whether the gateway supports
// an images endpoint depends on its backend; a failure is reported to the
// model, which routes around it.
export default defineTool({
  description:
    "Generate an image from a text prompt with the deployment's image model (served by the AI gateway). Use when the user asks you to create, draw, illustrate, or visualize a picture (a diagram, scene, concept art, mockup, etc.). Returns a hosted image URL. Not for editing existing images or for charts/data — write those as Markdown/code.",
  inputSchema: z.object({
    prompt: z
      .string()
      .min(1)
      .describe("A vivid, detailed description of the image to generate."),
  }),
  async execute({ prompt }) {
    if (!process.env.AI_GATEWAY_API_KEY) {
      return {
        prompt,
        error: "AI_GATEWAY_API_KEY is not configured — cannot generate images.",
      }
    }
    const modelId = process.env.IMAGE_MODEL ?? "gpt-image-2"

    let image: Awaited<ReturnType<typeof generateImage>>["image"]
    try {
      const res = await generateImage({
        model: imageModel(modelId),
        prompt,
      })
      image = res.image
    } catch (err) {
      return {
        prompt,
        error: `Image generation failed: ${(err as Error).message}`,
      }
    }

    const mediaType = image.mediaType || "image/png"
    const ext = mediaType.split("/")[1]?.split("+")[0] || "png"
    try {
      const blob = await put(
        `generated/${Date.now()}.${ext}`,
        Buffer.from(image.uint8Array),
        {
          addRandomSuffix: true,
          contentType: mediaType,
        }
      )
      return { prompt, url: blob.url, mediaType }
    } catch (err) {
      return {
        prompt,
        error: `Could not store the generated image: ${(err as Error).message}`,
      }
    }
  },
})
