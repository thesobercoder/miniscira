# PRD: Image generation aspect ratio

- **Status:** To do
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-image-generation-aspect-ratio)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Not approved

## Goal

Make image generation predictable by using a square image when the user does not request another shape.

## User stories

- As a user, when I ask MiniScira to generate an image without naming a shape, I receive a 1:1 square image.
- As a user, when I request a supported aspect ratio, MiniScira uses my requested ratio instead of the default.

## Scope

- Add an optional aspect-ratio input to `generate_image`.
- Use `1:1` when the input is absent.
- Tell the agent to pass a requested ratio when the user clearly asks for square, portrait, or landscape output.
- Pass the ratio through the AI SDK image-generation call.
- Add focused tests and an agent eval for default and explicit ratio routing.

## Non-goals

- No image settings UI.
- No per-user saved image preference.
- No arbitrary width and height input.
- No changes to image editing.
- No provider-specific image service.

## Functional requirements

1. `generate_image` accepts an optional supported aspect ratio.
2. The default is `1:1`.
3. A ratio explicitly requested by the user overrides the default.
4. The generated image remains stored and returned through the existing local-blob path.
5. Unsupported ratios fail clearly rather than silently changing shape.

## Technical requirements

- Use the AI SDK's supported image aspect-ratio option.
- Keep the ratio policy in the existing image-generation tool.
- Use a narrow schema for supported values.
- Preserve the current `IMAGE_MODEL` behavior and error handling.
- Do not add new storage, database, orchestration, or UI layers.

## Acceptance criteria

- A request such as “Generate an image of a red apple” calls image generation with `1:1`.
- A request that explicitly asks for a supported landscape or portrait ratio passes that ratio.
- Tool tests verify the default and explicit override.
- The image-generation eval verifies that ordinary image requests use the tool and that explicit shape wording reaches the tool correctly.
- Typecheck, lint, tests, and `git diff --check` pass.
- A live production Eve eval passes after deployment.
- A real production image request returns a downloadable image with square pixel dimensions for the default case.

## Deployment

Build and deploy a new MiniScira app image through the existing Portainer Stack 30 procedure. Preserve Stack environment and durable volumes.

## Observability

Use the existing tool result, app logs, Eve eval output, and downloaded image dimensions. Do not log prompts, credentials, or image bytes.

## Rollback

Restore the previous app image and Stack Compose backup. No database or storage migration is required.

## Open questions

None. The approved default is `1:1` square.
