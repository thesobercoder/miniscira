import { xai } from "@ai-sdk/xai"
import { put } from "@vercel/blob"
import { generateImage } from "ai"
import { defineTool } from "eve/tools"
import { z } from "zod"

// The model sees this tool as `generate_image`, from the filename. It renders in
// the timeline as the AIcss image-generation canvas (a shimmering placeholder
// with the prompt) while running, and swaps to the finished picture on success.
export default defineTool({
  description:
    "Generate an image from a text prompt with xAI's image model. Use when the user asks you to create, draw, illustrate, or visualize a picture (a diagram, scene, concept art, mockup, etc.). Returns a hosted image URL. Not for editing existing images or for charts/data — write those as Markdown/code.",
  inputSchema: z.object({
    prompt: z
      .string()
      .min(1)
      .describe("A vivid, detailed description of the image to generate."),
  }),
  async execute({ prompt }) {
    if (!process.env.XAI_API_KEY) {
      return {
        prompt,
        error: "XAI_API_KEY is not configured — cannot generate images.",
      }
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return {
        prompt,
        error:
          "BLOB_READ_WRITE_TOKEN is not configured — cannot store the image.",
      }
    }

    let image: Awaited<ReturnType<typeof generateImage>>["image"]
    try {
      const res = await generateImage({
        model: xai.image("grok-imagine-image"),
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
        { access: "public", addRandomSuffix: true, contentType: mediaType }
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
