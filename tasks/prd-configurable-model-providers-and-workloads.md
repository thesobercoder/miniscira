# PRD: Configurable model providers and workload models

- **Status:** To do
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-separate-model-defaults)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Not approved

## Goal

Make provider freedom a working product feature. MiniScira uses OpenRouter as the first reference provider while retaining support for any compatible OpenAI-style API. An operator controls the model catalog and workload defaults. Each user chooses an interactive chat default from the allowed catalog.

## User stories

- As an operator, I can connect MiniScira to OpenRouter without changing source code.
- As an operator, I can connect another OpenAI-compatible API with the same configuration contract.
- As an operator, I can allow only reviewed models and hide every other provider model.
- As an operator, I can assign different models to chat, research, compaction, Lookouts, memory work, image generation, and video generation.
- As a user, I can choose my chat default from the operator's allowed chat models.
- As a user, I see only models that can handle the content I am sending.
- As a user, MiniScira explains when a selected model cannot accept an image or another attachment type.

## Product decisions

1. OpenRouter is the first reference provider and production migration target.
2. MiniScira remains compatible with other OpenAI-style APIs. OpenRouter-specific metadata and headers live behind a provider adapter.
3. One shared deployment provider is active at a time in the first release. An external router may combine providers behind that endpoint.
4. The operator owns the allowed model catalog and workload defaults.
5. A signed-in user's chat default is a preference inside the allowed interactive-chat catalog.
6. Background workloads do not inherit a user's chat choice.
7. Provider model lists are discovery input, not policy. A discovered model is unavailable until the operator allows it.
8. MiniScira never guesses missing capabilities. Generic providers may require operator-supplied capability overrides.
9. A workload runs only when its assigned model satisfies every required capability.
10. Model IDs remain provider values. MiniScira does not silently substitute a different model when an ID is missing.

## Scope

### Provider configuration

- Configure the shared gateway base URL, API key, provider type, and optional safe provider headers.
- Provide a first-class OpenRouter profile.
- Provide a generic OpenAI-compatible profile.
- Test model listing, chat completions, streaming, tool calling, structured output, image generation, image editing, and video generation separately.
- Keep the existing per-user gateway credential feature where it remains compatible with the selected provider policy.

### Model catalog and capabilities

Normalize provider metadata into this conceptual shape:

```ts
type Modality = "text" | "image" | "audio" | "video";

type ModelCapabilities = {
  input: ReadonlySet<Modality>;
  output: ReadonlySet<Modality>;
  streaming: boolean;
  tools: boolean;
  structuredOutput: boolean;
  imageGeneration: boolean;
  imageEditing: boolean;
  videoGeneration: boolean;
  contextWindowTokens: number | null;
};

type AllowedModel = {
  modelId: string;
  displayName: string;
  enabled: boolean;
  capabilities: ModelCapabilities;
  capabilitySource: "provider" | "operator_override" | "verified_probe";
};
```

The final names may follow repository conventions, but the distinctions are required.

### Workload model policy

The operator can assign allowed models to these workloads:

- Interactive chat deployment fallback.
- Deep-research root agent.
- Researcher subagent.
- Conversation compaction.
- Lookout execution.
- Memory extraction and other scheduled memory work.
- Chat title and summary generation.
- Evaluation runs.
- Image generation.
- Image editing.
- Video generation.

Each workload has one primary model and an optional ordered fallback list. Every fallback must satisfy the same capability requirements. No workload falls back to an unapproved model.

### Per-user chat choice

- A signed-in user chooses a default interactive-chat model from the allowed chat catalog.
- The choice follows the user across browsers and devices.
- The picker shows input and output modality support.
- When the current message contains an image, the picker shows only image-input chat models or clearly disables incompatible choices.
- Future audio or video attachments use the same rule.
- Retry-with-another-model remains a turn-level override and does not change the saved default unless the user explicitly makes it the default.

## Capability rules

The initial workload requirements are:

| Workload | Required capabilities |
|---|---|
| Text chat | Text input, text output, streaming |
| Chat with image attachment | Text and image input, text output, streaming |
| Research root | Text input and output, streaming, tools |
| Researcher subagent | Text input and output, tools |
| Compaction | Text input and output, sufficient verified context window |
| Lookout | Text input and output, tools |
| Memory extraction | Text input and output, structured output |
| Image generation | Text input, image output, image-generation endpoint support |
| Image editing | Text and image input, image output, image-edit endpoint support |
| Video generation | Text input, video output, video-generation adapter support |

A provider may use separate endpoints for chat, image, and video work. OpenAI compatibility for chat does not prove image or video compatibility.

## Functional requirements

1. An authenticated operator can view discovered models and their normalized capabilities.
2. The operator can enable or disable each model.
3. The operator can correct missing or wrong capability metadata through explicit overrides.
4. MiniScira records whether each capability came from provider metadata, an operator override, or a verified probe.
5. The operator can assign workload models only from the enabled catalog.
6. Saving an incompatible assignment fails with a specific missing-capability error.
7. Removing a model from the allowed catalog identifies affected users and workloads before the change takes effect.
8. A user cannot save a chat default outside the allowed chat catalog.
9. If a saved user default becomes unavailable, MiniScira uses the deployment chat fallback without deleting the user's preference.
10. The model picker filters or disables models based on the current message modalities.
11. The server repeats capability validation before dispatch. Client filtering is not a security or correctness boundary.
12. The active provider configuration has a connection test that does not send private user content.
13. The OpenRouter adapter supports required attribution headers without requiring them for generic providers.
14. API keys never reach browser code, logs, model metadata responses, or committed files.
15. A failed background model assignment fails that workload clearly. It does not borrow the interactive user's model or credential silently.
16. Every generated artifact records the provider model ID used without recording credentials.

## Technical requirements

- Keep one provider boundary in `lib/gateway.ts` and related model-catalog modules.
- Separate provider discovery from operator policy and workload resolution.
- Store non-secret catalog policy and workload assignments in Postgres.
- Store shared provider credentials only in the deployment's protected secret configuration.
- Preserve per-user credential encryption for supported bring-your-own-key flows.
- Resolve a workload model through one typed function that returns the model ID, credential policy, and verified capabilities.
- Replace the universal 200,000-token assumption with provider metadata or an explicit verified override.
- Cache model discovery for a bounded period and expose the last successful refresh time.
- Keep the last valid policy when provider discovery is temporarily unavailable.
- Do not make a provider outage rewrite saved user or workload settings.
- Treat video generation as a provider adapter because no universal OpenAI-compatible video endpoint can be assumed.

## Migration to OpenRouter

1. Capture the current provider configuration, model catalog, workload defaults, and rollback image.
2. Configure OpenRouter credentials in the protected deployment environment.
3. Import OpenRouter model metadata through the provider adapter.
4. Create an explicit allowlist.
5. Map every current workload to an allowed OpenRouter model.
6. Verify text chat, image input, tool calls, structured output, compaction, image generation, image editing, and video generation where enabled.
7. Run a scratch deployment before changing production.
8. Update production only after every required workload has a passing model.
9. Keep the previous provider configuration available during the soak period.
10. Roll back by restoring the previous provider configuration. No user or chat data migration is required.

OmniRoute and CLIProxyAPI are possible rollback or external-routing choices. Neither remains a mandatory MiniScira dependency.

## Evals and tests

### Unit tests

- Normalize OpenRouter capability metadata.
- Normalize generic OpenAI-compatible metadata with explicit overrides.
- Reject unknown capabilities instead of assuming support.
- Resolve every workload primary and fallback.
- Reject incompatible workload assignments.
- Enforce per-user allowed-model boundaries.
- Preserve user preferences during temporary model removal.

### Integration tests

- Refresh a provider catalog with credentials kept server-side.
- Save operator allowlist and workload assignments.
- Save two users' different chat defaults without cross-user leakage.
- Dispatch chat, tool, structured-output, image, and video requests through their assigned models.
- Return a clear error when the endpoint does not implement a required generation API.

### Browser acceptance

- The operator can configure the catalog and workload models.
- A user sees only allowed chat models.
- Adding an image removes or disables text-only models.
- The user's default survives logout, another browser, and application restart.
- Another user's default remains independent.

### Production acceptance

- OpenRouter serves the allowed model catalog.
- Ordinary chat streams successfully.
- Image attachment understanding succeeds on an image-input model.
- Research tools complete on the assigned research models.
- Two compaction cycles preserve the long-conversation retention fixture.
- A Lookout completes with its assigned background model.
- Image generation and image editing return stored artifacts.
- Video generation returns a stored artifact when the selected provider and model support it.
- Provider request and cost records identify the workload and model without storing secrets or prompt bodies.

## Acceptance criteria

- [ ] OpenRouter works as the production provider without source changes.
- [ ] A generic OpenAI-compatible endpoint works through the same public configuration contract.
- [ ] The operator controls the allowed model catalog.
- [ ] Capability metadata distinguishes text, image, audio, and video input and output.
- [ ] Chat model choices respect current message modalities.
- [ ] Per-user chat defaults persist across browsers and remain isolated between users.
- [ ] Background workloads use independent operator-selected models.
- [ ] Image generation and image editing use independently selected compatible models.
- [ ] Video generation uses an independently selected compatible model and provider adapter.
- [ ] Compaction uses the selected model's verified context limit.
- [ ] No workload silently substitutes an unavailable or incompatible model.
- [ ] Provider credentials remain server-side and secret.
- [ ] Unit, integration, browser, eval, rollback, and production checks pass.

## Non-goals

- Building a general-purpose multi-provider router inside MiniScira.
- Automatically enabling every model returned by a provider.
- Assuming that chat compatibility includes image or video generation.
- Letting users override operator workload policy.
- Changing models automatically based only on price or popularity.
- Removing the existing rollback provider before production soak completes.

## Deployment

Use the existing immutable MiniScira image and Portainer stack workflow. Preserve the current stack environment, database, uploads, sandbox middleware, egress controls, and rollback image. Provider secrets remain in protected stack environment values.

## Observability

Record provider type, model ID, workload, request status, latency, token usage, estimated cost when available, and capability-policy version. Do not record API keys, authorization headers, prompt content, attachment bytes, or generated media bytes.

Expose safe operator checks for:

- Provider reachability.
- Last catalog refresh.
- Invalid workload assignments.
- Models removed by the provider.
- Capability overrides that have not passed a live probe.
- Workload failures and fallback use.

## Rollback

Restore the previous provider base URL, credential, model catalog policy, and workload assignments from the protected pre-cutover snapshot. Restart only the MiniScira application services that consume those settings. Verify health, model listing, one chat turn, one tool call, and one background workload.

## Open questions

- Which OpenRouter models should form the first production allowlist?
- Which video-generation API shape should the first adapter support?
- Should operator model policy live only in an administrator UI, or also support a versioned deployment configuration for reproducible installs?
- Which workloads require a fallback, and which should fail rather than use a second model?
