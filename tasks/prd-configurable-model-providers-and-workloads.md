# PRD: Configurable model providers and workload models

- **Status:** To do
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-separate-model-defaults)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Not approved

## Goal

Make provider freedom a working product feature. MiniScira uses OpenRouter as the first reference provider while retaining support for any compatible OpenAI-style API. An administrator controls the model catalog and workload defaults. Each user chooses an interactive chat default from a curated multimodal catalog.

## User stories

- As an administrator, I can connect MiniScira to OpenRouter without changing source code.
- As an administrator, I can connect another OpenAI-compatible API with the same configuration contract.
- As an administrator, I can allow only reviewed models and hide every other provider model.
- As an administrator, I can assign different models to chat, research, compaction, Lookouts, memory work, image generation, and video generation.
- As a user, I can choose my chat default from the administrator's allowed multimodal chat models.
- As a user, I never see text-only models or provider capability details in the chat picker.

## Product decisions

1. OpenRouter is the first reference provider and production migration target.
2. MiniScira remains compatible with other OpenAI-style APIs. OpenRouter-specific metadata and headers live behind a provider adapter.
3. One shared deployment provider is active at a time in the first release. An external router may combine providers behind that endpoint.
4. An authenticated MiniScira administrator owns the allowed model catalog and workload defaults through an administrator settings area.
5. Environment variables bootstrap the first administrator identity and hold deployment encryption roots. They are not the normal interface for model policy.
6. A signed-in user's chat default is a preference inside the administrator's allowed multimodal chat catalog.
7. Every user-visible chat model must accept both text and image input and produce text output. Text-only models never enter the user catalog.
8. Background workloads do not inherit a user's chat choice.
9. Provider model lists are discovery input, not policy. A discovered model is unavailable until the administrator allows it.
10. MiniScira never guesses missing capabilities. Generic providers may require administrator-supplied capability overrides.
11. A workload runs only when its assigned model satisfies every required capability.
12. Model IDs remain provider values. MiniScira does not silently substitute a different model when an ID is missing.

## Scope

### Provider configuration

- Configure the shared gateway base URL, API key, provider type, and optional safe provider headers.
- Provide a first-class OpenRouter profile.
- Provide a generic OpenAI-compatible profile.
- Test model listing, chat completions, streaming, tool calling, structured output, image generation, image editing, and video generation separately.
- Keep the existing per-user gateway credential feature where it remains compatible with the selected provider policy.

### Administrator and environment responsibilities

MiniScira adds an authenticated administrator role and an administrator settings area.

Environment variables own only bootstrap and recovery concerns:

- The initial administrator email or administrator bootstrap token.
- The database connection.
- Authentication secrets.
- The encryption root used to seal provider credentials stored by MiniScira.
- An optional emergency provider configuration used only when the database policy cannot load.

The administrator settings area owns normal operations:

- Provider type and base URL.
- The encrypted shared provider API key.
- Catalog refresh and connection tests.
- The multimodal chat eligibility rule.
- The administrator allowlist.
- The deployment chat default.
- Background, image, and video workload models.
- Capability overrides and their verification state.

Ordinary users cannot access these settings. Provider credentials never return to the browser after saving. The administrator UI returns only whether a credential exists and a masked hint.

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

The administrator can assign allowed models to these workloads:

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

- A signed-in user chooses a default interactive-chat model from the administrator's allowed multimodal chat catalog.
- Every visible choice accepts text and image input and produces text output.
- The choice follows the user across browsers and devices.
- The picker shows model names and selection state. It does not expose modality fields, text-only models, disabled models, or provider-policy errors.
- The server rejects any saved or dispatched chat model outside the current multimodal allowlist.
- Retry-with-another-model remains a turn-level override and does not change the saved default unless the user explicitly makes it the default.

## Capability rules

The initial workload requirements are:

| Workload | Required capabilities |
|---|---|
| Text chat and chat with image attachment | Text and image input, text output, streaming |
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

1. An authenticated administrator can view discovered models and their normalized capabilities.
2. Non-administrator requests to model-policy and provider-management routes return an authorization error without revealing configuration.
3. OpenRouter discovery reads `architecture.input_modalities`, `architecture.output_modalities`, `context_length`, and `supported_parameters`.
4. MiniScira excludes text-only and unknown-modality models before constructing the user-visible chat catalog.
5. The administrator can enable or disable each eligible model.
6. The administrator can correct missing or wrong capability metadata through explicit overrides.
7. MiniScira records whether each capability came from provider metadata, an administrator override, or a verified probe.
8. The administrator can assign workload models only from the enabled catalog.
9. Saving an incompatible assignment fails with a specific missing-capability error.
10. Removing a model from the allowed catalog identifies affected users and workloads before the change takes effect.
11. A user cannot view or save a chat default outside the allowed multimodal chat catalog.
12. If a saved user default becomes unavailable, MiniScira uses the deployment chat fallback without deleting the user's preference.
13. The server validates multimodal eligibility before every interactive dispatch.
14. The active provider configuration has a connection test that does not send private user content.
15. The OpenRouter adapter supports required attribution headers without requiring them for generic providers.
16. API keys never reach browser code, logs, model metadata responses, or committed files.
17. A failed background model assignment fails that workload clearly. It does not borrow the interactive user's model or credential silently.
18. Every generated artifact records the provider model ID used without recording credentials.

## Technical requirements

- Keep one provider boundary in `lib/gateway.ts` and related model-catalog modules.
- Separate provider discovery from administrator policy and workload resolution.
- Store non-secret catalog policy and workload assignments in Postgres.
- Seal shared provider credentials before storing them in Postgres. Derive encryption from a deployment-held encryption root that never enters the database.
- Preserve per-user credential encryption for supported bring-your-own-key flows.
- Resolve a workload model through one typed function that returns the model ID, credential policy, and verified capabilities.
- Replace the universal 200,000-token assumption with provider metadata or an explicit verified override.
- Cache model discovery for a bounded period and expose the last successful refresh time.
- Keep the last valid policy when provider discovery is temporarily unavailable.
- Do not make a provider outage rewrite saved user or workload settings.
- Treat video generation as a provider adapter because no universal OpenAI-compatible video endpoint can be assumed.

## Migration to OpenRouter

1. Capture the current provider configuration, model catalog, workload defaults, and rollback image.
2. Bootstrap the administrator identity and deployment encryption root through protected environment values.
3. Save the OpenRouter provider profile and credential through the administrator settings area.
4. Import OpenRouter model metadata through the provider adapter.
5. Exclude every model that lacks text and image input or text output.
6. Create an explicit administrator allowlist.
7. Map every current workload to an allowed OpenRouter model.
8. Verify text chat, image input, tool calls, structured output, compaction, image generation, image editing, and video generation where enabled.
9. Run a scratch deployment before changing production.
10. Update production only after every required workload has a passing model.
11. Keep the previous provider configuration available during the soak period.
12. Roll back by restoring the previous provider configuration. No user or chat data migration is required.

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
- Reject non-administrator access to provider and model-policy routes.
- Save the administrator allowlist and workload assignments.
- Save two users' different chat defaults without cross-user leakage.
- Dispatch chat, tool, structured-output, image, and video requests through their assigned models.
- Return a clear error when the endpoint does not implement a required generation API.

### Browser acceptance

- The administrator can configure the provider, catalog, and workload models.
- A user sees only administrator-approved multimodal chat models.
- Text-only models never appear, whether or not the current message has an attachment.
- Capability metadata and policy errors remain absent from the ordinary user picker.
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

- [ ] An authenticated administrator controls the provider, allowed model catalog, and workload assignments.
- [ ] Non-administrators cannot read or change provider or model-policy settings.
- [ ] OpenRouter works as the production provider without source changes.
- [ ] A generic OpenAI-compatible endpoint works through the same public configuration contract.
- [ ] OpenRouter capability fields drive the initial catalog filter.
- [ ] Text-only and unknown-modality models never appear to ordinary users.
- [ ] Every user-visible chat model accepts text and image input and produces text output.
- [ ] Per-user chat defaults persist across browsers and remain isolated between users.
- [ ] Background workloads use independent administrator-selected models.
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

Use the existing immutable MiniScira image and Portainer stack workflow. Preserve the current stack environment, database, uploads, sandbox middleware, egress controls, and rollback image. Environment values bootstrap the administrator and encryption root. The administrator settings area stores provider configuration and seals the provider credential before database storage.

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

## References

- [OpenRouter Models API](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties) documents `architecture.input_modalities`, `architecture.output_modalities`, `context_length`, and `supported_parameters`.
- [OpenRouter image generation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation) documents image-model discovery and per-endpoint capabilities.

## Open questions

- Which OpenRouter models should form the first production allowlist?
- Which video-generation API shape should the first adapter support?
- Should the first administrator be bootstrapped by an exact email allowlist or a one-time setup token?
- Which workloads require a fallback, and which should fail rather than use a second model?
