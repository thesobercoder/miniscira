# PRD: Configurable model providers and workload models

- **Status:** To do
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-separate-model-defaults)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Approved by Soham on 2026-09-10

## Goal

Make provider freedom a working product feature. MiniScira uses OpenRouter as the first reference provider while retaining support for any compatible OpenAI-style API. An administrator controls the model catalog and workload defaults. Each user chooses compatible models for user-facing features from that catalog.

## User stories

- As an administrator, I can connect MiniScira to OpenRouter without changing source code.
- As an administrator, I can connect another OpenAI-compatible API with the same configuration contract.
- As an administrator, I can allow only reviewed models and hide every other provider model.
- As an administrator, I can override deployment model defaults for chat, research, compaction, Lookouts, memory work, image generation, and image editing.
- As a user, I can choose my chat default from the administrator's allowed multimodal chat models.
- As a user, I can choose compatible models for research, Lookouts, image generation, and image editing.
- As a user, I never see text-only models or provider capability details in the chat picker.

## Scope

### Product decisions

1. OpenRouter is the first reference provider and production migration target.
2. MiniScira remains compatible with other OpenAI-style APIs. OpenRouter-specific metadata and headers live behind a provider adapter.
3. One shared deployment provider is active at a time in the first release. An external router may combine providers behind that endpoint.
4. An authenticated MiniScira administrator owns the allowed model catalog and workload defaults through an administrator settings area.
5. Environment variables define deployment provider and model defaults, bootstrap the first administrator with an email and password, and hold deployment encryption roots. Administrator settings can override provider and model defaults.
6. A signed-in user's chat default is a preference inside the administrator's allowed multimodal chat catalog.
7. Every user-visible chat model must accept both text and image input and produce text output. Text-only models never enter the user catalog.
8. Users can override models for user-facing features. This includes chat, research, Lookouts, image generation, and image editing. Video generation is deferred.
9. Internal maintenance workloads remain administrator-controlled. Users cannot override title generation, conversation compaction, memory extraction, summaries, or evaluation models.
10. Background workloads do not inherit a user's chat choice.
11. Provider model lists are discovery input, not policy. A discovered model is unavailable until the administrator allows it.
12. MiniScira never guesses missing capabilities. Generic providers may require administrator-supplied capability overrides.
13. A workload runs only when its assigned model satisfies every required capability.
14. Model IDs remain provider values. MiniScira does not silently substitute a different model when an ID is missing.

### Provider configuration

- Configure the shared gateway base URL, API key, provider type, and optional safe provider headers.
- Provide a first-class OpenRouter profile.
- Provide a generic OpenAI-compatible profile.
- Test model listing, chat completions, streaming, tool calling, structured output, image generation, and image editing separately.
- Keep the existing per-user gateway credential feature where it remains compatible with the selected provider policy.

### Administrator and environment responsibilities

MiniScira adds an authenticated administrator role and an administrator settings area.

Environment variables own deployment defaults, bootstrap, and recovery concerns:

- The initial administrator email and password.
- The database connection.
- Authentication secrets.
- The encryption root used to seal provider credentials stored by MiniScira.
- The default provider profile, credential, allowed catalog, and workload assignments.

The administrator settings area owns normal operations:

- Provider type and base URL.
- The encrypted shared provider API key.
- Catalog refresh and connection tests.
- The multimodal chat eligibility rule.
- The administrator allowlist.
- The deployment chat default.
- Background and image workload models.
- Capability overrides and their verification state.

Ordinary users cannot access these settings. Provider credentials never return to the browser after saving. The administrator UI returns only whether a credential exists and a masked hint.

### Deployment defaults and administrator overrides

The following names define the new configuration contract. They are planned settings, not a description of current implementation.

| Setting | Contract |
|---|---|
| `AI_GATEWAY_BASE_URL`, `AI_GATEWAY_API_KEY` | Default provider URL and server-side credential. Retain the existing names. |
| `MODEL_PROVIDER_TYPE` | Required provider profile, `openrouter` or `openai-compatible`. |
| `MODEL_POLICY_JSON` | Versioned, non-secret default catalog and workload policy. |
| `MINISCIRA_ADMIN_EMAIL`, `MINISCIRA_ADMIN_PASSWORD` | Initial administrator credentials. Required together for first bootstrap. |
| `MODEL_CREDENTIAL_ENCRYPTION_KEY` | Deployment-held encryption root for database provider credentials. Required before credentials can be saved. |

`MODEL_POLICY_JSON` contains `version`, `models`, and `workloads`. Each model includes its exact provider ID, display name, enabled state, and any explicit capability overrides. Each workload includes its enabled state, primary model ID, and ordered fallback IDs. Version 1 accepts only the workloads in this PRD. Unknown fields, duplicate IDs, invalid assignments, and unsupported versions fail validation.

The effective policy uses an administrator override when present and the environment default otherwise. Catalog and workload settings form one atomic policy document. They are not merged model by model. Provider profile overrides form a separate atomic document and bind credentials to the provider origin. Switching the provider requires validation of the complete effective policy before activation.

Administrator settings show whether each document comes from deployment defaults or an administrator override. Reset to deployment defaults validates the resulting policy before removing an override. Environment changes take effect after restart only where no override exists. Restart never overwrites administrator settings or user preferences.

Existing model environment settings remain import inputs during migration. Once the new policy is active, `DEFAULT_CHAT_MODEL`, `NEXT_PUBLIC_DEFAULT_CHAT_MODEL`, `IMAGE_MODEL`, and `AI_MODELS_JSON` no longer supply independent runtime model choices. The client receives the effective catalog and default from the server.

No model IDs are fixed in this PRD. Before rollout, the operator supplies an explicit allowlist and workload mapping in `MODEL_POLICY_JSON`. Each enabled assignment must pass the live checks below. Provider discovery never enables a model automatically.

### First administrator bootstrap

Bootstrap creates the initial account through the existing authentication password-hashing path and persists its administrator role. It runs before public signup traffic is accepted. A database transaction and uniqueness constraints prevent concurrent instances from creating multiple bootstrap accounts.

The bootstrap password is never stored as plaintext in Postgres, included in responses, or printed. After successful bootstrap, the operator can remove the password environment value. Later starts do not reset the password, change the administrator email, or grant another role when bootstrap values change.

If the email already belongs to an account, bootstrap requires the configured password to authenticate that account before granting the role. A mismatch stops bootstrap without changing the account. Missing bootstrap values on a database with no administrator leave administrator-dependent configuration unavailable with an operator-facing error. Existing chat data remains intact.

Password changes use the normal account flow. Recovery uses a documented operator command that requires database access and never resets credentials implicitly at startup.

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
  contextWindowTokens: number | null;
};

type AllowedModel = {
  modelId: string;
  displayName: string;
  enabled: boolean;
  capabilities: ModelCapabilities;
  capabilitySources: Record<string, "provider" | "administrator_override" | "verified_probe">;
};
```

The final names may follow repository conventions, but the distinctions are required.

Store provenance per capability, including the verification time and provider profile version for a probe. A model-wide source flag cannot represent a mixture of provider metadata and administrator overrides. Unknown values do not satisfy a workload requirement. Video modality metadata may be retained during discovery, but grants no video workload access in this release.

### Workload model policy

The policy registry defines who can override each workload model:

| Workload | Administrator default when enabled | User override | Override scope |
|---|---|---|---|
| Interactive chat | Required | Allowed | Saved default and current turn |
| Deep-research root agent | Required | Allowed | Saved default and current research run |
| Researcher subagent | Required | Allowed | Saved default and current research run |
| Lookout execution | Required | Allowed | Saved default and individual Lookout |
| Image generation | Required | Allowed | Saved default and current generation |
| Image editing | Required | Allowed | Saved default and current edit |
| Chat title generation | Required | Not allowed | Administrator only |
| Conversation summary generation | Required | Not allowed | Administrator only |
| Conversation compaction | Required | Not allowed | Administrator only |
| Memory extraction and scheduled memory work | Required | Not allowed | Administrator only |
| Evaluation runs | Required | Not allowed | Administrator only |

The administrator default applies when a user has not saved an override. Each user choice must come from the administrator's allowed catalog and satisfy the workload requirements. A current-action override does not change the saved default unless the user asks MiniScira to save it.

Each workload has one primary administrator model and an optional ordered fallback list. Every fallback must satisfy the same capability requirements. A user override replaces the primary model for that workload, but it does not replace the administrator's fallback policy. No workload falls back to an unapproved model.

Interactive chat, title generation, conversation summary, and compaction are required. Research, Lookouts, memory, evaluations, image generation, and image editing can be disabled explicitly. An enabled workload requires a compatible primary assignment. Disabled user-facing workloads have no model picker and reject dispatch without a provider request. Research enables both root and researcher assignments together. Production acceptance exercises every workload included in the rollout, with image generation and image editing required for this release.

Fallback lists default to empty. An invalid explicit action override returns a validation error. An unavailable saved preference uses the administrator default and leaves the preference intact. After selection, an administrator fallback may run only for an unavailable model or a transient failure proven to precede output and side effects. Authentication, policy, validation, and content-rejection errors do not trigger fallback.

Do not switch models after streamed output, a tool side effect, or a possibly accepted image request. An ambiguous timeout fails the action rather than creating another billed job. Record each attempt and fallback reason. Try each configured fallback at most once. Revalidate its capabilities and allowlist membership before dispatch. A fallback retains the action's credential policy and never switches from a user's key to the shared key after failure.

### Per-user feature model choices

- A signed-in user chooses defaults for user-facing features from the compatible administrator-approved catalog.
- Chat choices accept text and image input and produce text output.
- Image pickers show only models that support the exact generation or editing workload.
- The choices follow the user across browsers and devices.
- The interface shows model names and selection state. It does not expose provider capability fields, disabled models, or provider-policy errors.
- The server rejects any saved or dispatched choice outside the compatible allowlist for that workload.
- A per-action override does not change the saved default unless the user explicitly saves it.
- Title generation and other internal maintenance workloads do not appear in user settings or action-level model pickers.

## Non-goals

- Building a general-purpose multi-provider router inside MiniScira.
- Automatically enabling every model returned by a provider.
- Assuming that chat compatibility includes image generation or editing.
- Letting users select models outside the administrator catalog or bypass workload capability rules.
- Letting users override internal maintenance models.
- Changing models automatically based only on price or popularity.
- Removing the existing rollback provider before production soak completes.
- Video generation, video model settings, and video adapters. Track these in the [deferred video idea](../docs/PRODUCT_IDEAS.md#idea-video-generation).

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
10. Removing a model from the allowed catalog identifies affected user preferences and workload assignments before the change takes effect.
11. A user can view and save compatible defaults for chat, research, researcher subagents, Lookouts, image generation, and image editing.
12. A user can override those models for one turn, run, Lookout, generation, or edit without changing the saved default.
13. A user cannot view or change title, summary, compaction, memory, or evaluation model assignments.
14. If a saved user default becomes unavailable, MiniScira uses the administrator default without deleting the user's preference.
15. The server validates catalog membership and workload capabilities before every dispatch.
16. The active provider configuration has a connection test that does not send private user content.
17. The OpenRouter adapter supports required attribution headers without requiring them for generic providers.
18. API keys never reach browser code, logs, model metadata responses, or committed files.
19. A failed internal workload assignment fails that workload clearly. It does not borrow a user-selected model or credential silently.
20. Every generated artifact records the provider model ID used without recording credentials.

## Technical requirements

### Capability rules

The initial workload requirements are:

| Workload | Required capabilities |
|---|---|
| Text chat and chat with image attachment | Text and image input, text output, streaming |
| Research root | Text input and output, streaming, tools |
| Researcher subagent | Text input and output, tools |
| Compaction | Text input and output, sufficient verified context window |
| Lookout | Text input and output, tools |
| Memory extraction | Text input and output, structured output |
| Title generation | Text input and output, structured output |
| Conversation summary | Text input and output, sufficient verified context window |
| Evaluation | Capabilities required by the evaluation suite |
| Image generation | Text input, image output, image-generation endpoint support |
| Image editing | Text and image input, image output, image-edit endpoint support |

A provider may use separate endpoints for chat and image work. OpenAI compatibility for chat does not prove image compatibility. Support OpenRouter image output through chat completions and generic OpenAI-compatible image generation and editing endpoints as separate adapter operations. Verify each operation with a synthetic fixture before activation.

- Keep one provider boundary in `lib/gateway.ts` and related model-catalog modules.
- Separate provider discovery from administrator policy and workload resolution.
- Store non-secret catalog policy and workload assignments in Postgres.
- Seal shared provider credentials before storing them in Postgres. Derive encryption from a deployment-held encryption root that never enters the database.
- Preserve per-user credential encryption for supported bring-your-own-key flows.
- Define workload ownership in one typed registry. Each entry declares its capability requirements, administrator default, whether a user override is allowed, and the supported override scopes.
- Store user model preferences by workload. Do not add one database column for each new workload.
- Resolve a workload model through one typed function that returns the model ID, credential policy, and verified capabilities.
- Resolve models in this order: a valid action-level override, a valid saved user preference, the effective administrator default, and then the administrator fallback list. Reject invalid explicit overrides instead of skipping them.
- Replace the universal 200,000-token assumption with provider metadata or an explicit verified override.
- Cache model discovery for a bounded period and expose the last successful refresh time.
- Keep the last valid policy when provider discovery is temporarily unavailable.
- Do not make a provider outage rewrite saved user or workload settings.
- Bind per-user credentials to the effective provider origin. A provider switch requires the user to save a compatible key again. Internal workloads always use the shared provider credential. User-facing workloads use a compatible saved key, or the shared key only when deployment policy permits it.
- Refresh discovery on administrator request and cache it for at most 15 minutes. A failed refresh retains the last successful snapshot and exposes its age to administrators. A successful refresh that removes a model makes it unavailable without deleting preferences.
- Publish policy changes with a version and an atomic database write. Reject stale administrator edits. Every dispatch reads the active version. Multi-step runs revalidate before each provider call.
- If policy storage fails, use only the last validated effective policy already held by the process. A cold process without a validated policy fails model dispatch. Never bypass an administrator override by silently reverting to environment defaults.
- Keep provider management behind server-side administrator authorization and the existing request-origin protections. Allow only supported attribution headers. Never accept browser-supplied authorization or host headers as provider settings.
- Before disabling a model, show affected assignments and a count of user preferences. Block the change until required assignments have replacements. Preserve user preferences and apply their documented default behavior.
- Derive compaction thresholds from the selected model's context limit, reserved output, and prompt overhead. A verified context limit must also cover summary input. Unknown limits block these assignments instead of using 200,000 tokens.

### Verification plan

The following test paths are planned artifacts. Create implementation TODOs only after PRD approval. Every acceptance criterion maps to a verification group below. A required group passes only when every assertion passes. A skipped required check blocks completion.

| Group | Planned artifact and fixtures | Required result |
|---|---|---|
| V1. Configuration and bootstrap | `lib/model-policy.test.ts` and `lib/admin-bootstrap.test.ts`. Environment defaults, database overrides, malformed JSON, concurrent bootstrap, existing account, restart, and reset fixtures. | Effective precedence is exact. Invalid settings never activate. Bootstrap creates one administrator, hashes the password, rejects a conflicting account password, and never resets an existing password. |
| V2. Catalog and resolution | `lib/model-catalog.test.ts` and `lib/workload-models.test.ts`. OpenRouter and generic metadata, unknown modalities, mixed capability sources, missing models, every workload, and ordered fallbacks. | Unknown capabilities fail closed. Only allowed compatible models resolve. Explicit invalid choices fail. Removed saved choices remain stored. Context thresholds use the assigned model limit. |
| V3. Authorization and persistence | `lib/model-policy.integration.test.ts`. Postgres, an administrator, two ordinary users, an anonymous caller, and a recording provider fixture. | Unauthorized reads and writes fail without secrets. User preferences remain isolated. Internal assignments cannot be read or overridden by users. Stale policy writes fail. Provider switches cannot forward old user keys. |
| V4. Provider dispatch | `lib/model-provider.integration.test.ts`. Recording OpenRouter and generic endpoints for streaming, tools, structured output, generation, and editing. Inject rate limits, authentication failures, partial streams, and ambiguous image timeouts. | Requests use the exact selected model and credential policy. Fallback occurs only under the defined rule. No duplicate side effects occur. Unsupported image endpoints return an actionable error. Stored images remain readable after restart. |
| V5. Browser flow | `scripts/verify-model-policy-browser.ts`. One administrator and two users in separate browser contexts, plus a second context for the first user. | Configure, test, activate, override, and reset policy. Save and use each user-facing model preference. Prove one-action overrides do not save defaults. Preferences survive logout and app restart. Ordinary pickers contain names and selection state only, with no text-only chat models. |
| V6. Live workload evals | `evals/workload-models.eval.ts` and `evals/fixtures/workload-models/`. Cases and thresholds below. | Every enabled primary and configured fallback passes its workload cases before activation for production. |
| V7. Migration and rollback | `scripts/verify-model-policy-migration.ts`. Fresh database and populated pre-feature database with users, keys, chats, Lookouts, and uploads. | Apply migrations twice. Import legacy settings without widening the allowlist. Preserve data and decryptable existing keys. Rehearse policy reset and previous-image rollback in scratch. Prove chat and a background action after rollback. |
| V8. Production and observability | A timestamped acceptance record for the deployed commit, effective policy version, and sanitized probe results. | Repeat the live user flow on production. Verify actual stored artifacts, model IDs, safe usage records, and a 24-hour soak without unauthorized dispatch, duplicate jobs, or credential leakage. |

Run focused tests first, then `bun run typecheck`, `bun run lint`, `bun test`, `bun run check`, and `git diff --check`. Run the browser and migration scripts with Bun. The implementation must document the exact live-eval command and required fixture setup before execution.

### Live eval fixtures and thresholds

Model routing changes require both deterministic dispatch tests and live model evals. Provider health alone does not satisfy this requirement. Run each applicable fixture three times per enabled primary and configured fallback. All three attempts must pass. Keep test content synthetic.

| Case | Fixture | Pass condition for each attempt |
|---|---|---|
| Chat and image understanding | A short text question and a generated image with three labeled colored shapes. | A nonempty streamed answer completes. The image answer identifies every label, shape, and color. The recorded model matches policy. |
| Research root and researcher | Two local source pages with distinct facts and a request requiring both. | Root and researcher use their separate assigned models. The result contains both facts with citations to the fixture pages and no invented source. |
| Title and memory | A synthetic conversation with a named project, one explicit preference, and a superseded fact. | Output passes the required schema. The title names the project. Memory retains the explicit preference and current fact without the superseded fact. User model overrides never affect these calls. |
| Summary and compaction | A long conversation with 12 fixed facts split equally across early, middle, and recent messages. Force two compaction cycles using the assigned verified limit. | All 12 facts remain recoverable after both cycles, reload, and restart. Requests fit the computed context budget. Summary and compaction use their own assignments. |
| Lookout | A scheduled request against a fixed source page with a known update. | The persisted report contains the update and source. Dispatch uses the Lookout's action choice, saved preference, or effective default in the specified order. |
| Image generation and editing | Generate a blue square on white, then request a red circle while retaining the white background. | Both operations return decodable stored images. A recorded human inspection confirms the requested content and edit. Separate selected model IDs match the artifact metadata. |
| Evaluation ownership | Run the suite while the test user has a different chat preference and submits an internal-model override. | The override is rejected. Evaluation model calls use the administrator assignment and the capabilities declared by the suite. |

Also run one real generic OpenAI-compatible endpoint through the public configuration contract in scratch. Verify listing, chat streaming, tools, and structured output. Verify image operations on both profiles where enabled. A mock provider alone does not prove generic compatibility. Record provider version and supported operations without credentials.

### References

- [OpenRouter Models API](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties) documents `architecture.input_modalities`, `architecture.output_modalities`, `context_length`, and `supported_parameters`.
- [OpenRouter image generation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation) documents image-model discovery and per-endpoint capabilities.

## Acceptance criteria

- [ ] AC1. Deployment environment values provide a validated default provider, catalog, and workload policy. Administrator overrides persist across restarts and can be reset. V1, V5, V7.
- [ ] AC2. Deployment email and password bootstrap one administrator without plaintext password storage or reset on restart. V1, V3, V7.
- [ ] AC3. An authenticated administrator controls the provider, allowed catalog, capability overrides, and workload assignments. V2, V3, V5.
- [ ] AC4. Non-administrators cannot read or change provider or model-policy settings. Credentials never reach browser responses or logs. V3, V4, V8.
- [ ] AC5. OpenRouter works as the production provider without source changes. A real generic endpoint uses the same configuration contract in scratch. V4, V6, V8.
- [ ] AC6. OpenRouter capability fields and explicit generic overrides drive compatibility. Every user-visible chat model accepts text and image input, produces text output, and streams. Unknown-modality and text-only models are absent from chat pickers. V2, V5.
- [ ] AC7. Two users can save independent chat, research-root, researcher, Lookout, image-generation, and image-editing defaults across browsers and restarts. V3, V5.
- [ ] AC8. Every user-facing action accepts a compatible one-action override without changing the saved preference. An invalid explicit override fails before dispatch. V2, V4, V5.
- [ ] AC9. Image generation and editing use user-selected compatible models and produce readable stored artifacts with model IDs. V4, V6, V8.
- [ ] AC10. Internal workloads use administrator assignments and shared credentials. Users cannot view or override these assignments. V2, V3, V6.
- [ ] AC11. Summary and compaction use verified model context limits and preserve all fixture facts through two compactions, reload, and restart. V2, V6.
- [ ] AC12. Removed saved choices remain stored. Fallback uses only approved compatible models before output or side effects. No ambiguous image request is replayed. V2, V4.
- [ ] AC13. Catalog refresh failures preserve the last valid policy. Policy changes activate atomically and never silently bypass administrator settings. V1, V2, V3.
- [ ] AC14. Unit, integration, browser, live-eval, authorization, migration, rollback, and production checks pass with evidence for the release commit. V1 through V8.

## Deployment

### Activate the model policy

1. Capture the current provider configuration, model catalog, workload defaults, and rollback image.
2. Set the default provider, `MODEL_POLICY_JSON`, initial administrator email and password, and encryption root through protected deployment environment values.
3. Apply the additive database migrations and bootstrap the administrator. Validate the environment policy before activation. Test an administrator override and reset in scratch.
4. Import OpenRouter model metadata through the provider adapter.
5. Exclude every model that lacks text and image input, text output, or streaming from the chat catalog. Retain compatible text-only models for other workloads.
6. Create an explicit administrator allowlist.
7. Map every current workload to an allowed OpenRouter model.
8. Verify text chat, image input, tool calls, structured output, compaction, image generation, and image editing. Verify research, Lookouts, memory, and evaluations when enabled.
9. Run a scratch deployment before changing production.
10. Update production only after every required workload has a passing model.
11. Keep the previous provider configuration available during the soak period.
12. Complete the 24-hour production soak. If a release gate fails, restore the captured policy and previous image through the rollback procedure.

OmniRoute and CLIProxyAPI are possible rollback or external-routing choices. Neither remains a mandatory MiniScira dependency.

Use the Railway deployment workflow in the [Railway template guide](../docs/RAILWAY_TEMPLATE.md). Preserve the database, upload volume, deployment secrets, and previous image reference. Rehearse in a scratch Railway environment before production. Save provider credentials only after sealing them with the deployment encryption root. Remove the bootstrap password environment value after successful setup.

This PRD changes the current environment-only model configuration contract. Update the model configuration section in the [deployment guide](../docs/DEPLOYMENT.md) and `.env.example` during implementation. Do not document the proposed settings as shipped before then.

## Observability

Record provider type, model ID, workload, request status, latency, token usage, estimated cost when available, and capability-policy version. Do not record API keys, authorization headers, prompt content, attachment bytes, or generated media bytes.

Record the source of each selection, the fallback reason, and a correlation ID for each action and attempt. Unknown usage or cost remains null rather than zero. Reuse the existing operational log retention policy. Provider error responses must be sanitized before storage or display.

Expose safe operator checks for:

- Provider reachability.
- Last catalog refresh.
- Invalid workload assignments.
- Models removed by the provider.
- Capability overrides that have not passed a live probe.
- Workload failures and fallback use.

## Rollback

Restore the previous provider base URL, credential, model catalog policy, and workload assignments from the protected pre-cutover snapshot. Restart only the MiniScira application services that consume those settings. Verify health, model listing, one chat turn, one tool call, and one background workload.

Keep schema changes additive so the previous application image can run without dropping the new tables or columns. Restore the previous environment values when the old image requires them. Keep the encryption root needed to read stored credentials. Policy rollback must not restore an older user database or erase newer chats, preferences, or artifacts. Record the deployed image and policy version after the rehearsal and any production rollback.

## Open questions

No unresolved product questions remain for this draft. The user selected the following directions on 2026-09-10 while requesting PRD finalization. These decisions do not approve implementation.

- Deployment environment values provide default model policy. Administrators can override it.
- Deployment email and password bootstrap the first administrator.
- Video generation is deferred to a separate backlog idea.
- Fallback is explicit and permitted only before output or side effects.

The exact production model IDs and real generic test endpoint are rollout inputs. Record them with passing eval evidence before production activation. The setting names, atomic override behavior, bootstrap collision handling, and verification thresholds above are proposed details for review with this PRD.
