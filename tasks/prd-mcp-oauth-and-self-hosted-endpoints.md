# PRD: MCP OAuth and self-hosted endpoints

- **Status:** In progress
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-mcp-oauth-and-self-hosted-endpoints)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Approved by Soham on 2026-08-23

## Goal

Make MCP connections reliable for self-hosted MiniScira deployments and OAuth providers that require a localhost callback.

Keep the common connection flow automatic. Put provider-specific controls under each MCP server's Advanced panel.

## User stories

- As a user, I can connect a normal OAuth MCP without leaving the MCP settings page.
- As a user, I can connect an OAuth MCP that requires a localhost callback.
- As a user, I can enter the exact callback URL registered with an OAuth provider.
- As a user, I can paste the failed localhost redirect URL into MiniScira to finish authorization.
- As a self-hosting user, I can add an MCP server that uses HTTP on my trusted LAN or private network.
- As a user, I receive a clear warning when an MCP endpoint uses unencrypted HTTP.

## Scope

### Per-MCP callback configuration

Add an OAuth callback mode to each MCP server:

- `Automatic`: use MiniScira's normal callback URL. This is the default.
- `Manual`: use an exact callback URL entered by the user.

The setting belongs to the MCP server record. It is not a deployment-wide setting.

The manual callback URL may use HTTP or HTTPS. It must be a valid absolute URL with no embedded username, password, or fragment.

The UI must explain that the URL must exactly match the value registered or required by the OAuth provider.

### New-tab authorization

Open every MCP OAuth authorization page in a new browser tab. Keep the MCP settings page open in the original tab.

Open the new tab as a direct result of the Connect button click so normal popup protection permits it. Close the empty tab when OAuth startup fails.

For automatic callbacks:

1. The provider redirects the new tab to MiniScira.
2. MiniScira validates and completes the OAuth exchange.
3. The callback page reports success or failure.
4. The original MCP page refreshes the server state.
5. The callback tab closes itself when the browser permits it. Otherwise, it tells the user to close it.

Use a documented browser communication mechanism such as `BroadcastChannel` for the completion signal. The original page must also refresh or poll as a fallback.

### Manual callback completion

For manual mode:

1. MiniScira starts OAuth with the configured callback URL.
2. The provider redirects the new tab to that URL.
3. If nothing listens at the callback URL, the browser may show a connection error. This is expected.
4. The original MCP panel shows a field where the user can paste the complete final URL from the new tab.
5. An authenticated MiniScira API endpoint parses and completes the callback.

MiniScira must validate:

- The pasted value is a valid absolute URL.
- Its origin and path match the callback URL frozen for that OAuth attempt.
- It contains either an OAuth error or both `code` and `state`.
- The state identifies an MCP server owned by the signed-in user.
- The state matches the encrypted state saved for that attempt.

MiniScira then uses the saved PKCE verifier and the exact frozen callback URL to exchange the code. It clears the code, state, verifier, and frozen callback after success or terminal failure.

The pasted URL and authorization code must not be logged or stored after processing.

### MCP endpoint URL policy

Allow MCP server endpoint URLs that use either `http://` or `https://` on any valid hostname or IP address.

Reject:

- malformed URLs;
- schemes other than HTTP and HTTPS;
- embedded usernames or passwords;
- URL fragments.

Show a warning for HTTP endpoints:

> This MCP server uses unencrypted HTTP. Only connect if it is on a network you trust.

The server API must enforce the same validation as the browser UI.

### OAuth client settings

Keep OAuth client ID and secret settings under the MCP server's Advanced panel.

- Show the saved client ID.
- Never return or display the saved client secret.
- Leaving the secret field empty keeps the existing encrypted secret.
- Changing callback mode or callback URL invalidates OAuth tokens, registered client information, PKCE verifier, state, and any pending authorization attempt.

## Non-goals

- Running a local callback listener on the user's computer.
- Installing a browser extension or desktop helper.
- Device authorization unless a later provider-specific PRD adds it.
- Relaxing the HTTPS requirement for a remote OAuth authorization server. Loopback development authorization servers remain the only HTTP exception.
- Supporting non-HTTP MCP transports.
- Automatically guessing a provider's required callback URL.

## Functional requirements

No separate functional requirements were recorded.

## Technical requirements

- Store callback mode and configured callback URL per MCP server.
- Store the callback URL used by the active OAuth attempt so registration, authorization, and token exchange use the exact same value.
- Add a committed database migration. Normal application startup must not modify the schema.
- Preserve encryption for OAuth clients, tokens, PKCE verifiers, and state.
- Keep ownership and session checks on every MCP OAuth route.
- Keep the normal automatic flow simple and selected by default.
- Do not expose authorization codes, secrets, tokens, or full pasted callback URLs in logs or API error messages.
- Use public browser and Next.js APIs. Do not use private framework state.

### Test plan

### Unit tests

- MCP endpoint URL validation for HTTPS, public HTTP, LAN HTTP, localhost, private IPs, malformed URLs, unsupported schemes, embedded credentials, and fragments.
- Callback URL validation and exact origin/path matching.
- Callback mode resolution and automatic default behavior.
- OAuth client metadata uses the selected callback URL.
- Token exchange uses the frozen callback URL.
- State ownership, mismatch, replay, and expiry behavior.
- Credential invalidation when callback settings change.
- Public MCP serialization never exposes protected values.

### API integration tests

- Add HTTP and HTTPS MCP endpoints.
- Reject unsafe endpoint URL shapes.
- Save callback mode and URL on an owned MCP.
- Reject changes to another user's MCP.
- Complete a manual callback through the authenticated API.
- Reject malformed, mismatched, replayed, and cross-user callback submissions.
- Verify secrets and callback codes are absent from responses and captured logs.

### Browser tests

- Connect opens a new tab while the original MCP page stays mounted.
- Automatic completion updates the original page.
- Popup failure produces a useful error without losing state.
- Manual mode shows clear instructions and a paste field.
- A valid pasted callback reports success.
- Invalid pasted values show safe, specific errors.
- HTTP MCP endpoint warning is visible and keyboard accessible.
- Check narrow-screen and keyboard behavior.

### Migration and rollback tests

- Apply the committed migration to a copy of the production schema.
- Verify existing MCP rows default to automatic mode.
- Verify existing encrypted OAuth clients and tokens still open.
- Verify rollback can restore the prior image and schema-compatible behavior without deleting user data.

### Quality gates

Run focused tests, then:

```bash
/opt/data/bin/bun run typecheck
/opt/data/bin/bun run lint
/opt/data/bin/bun test
/opt/data/bin/bun run check
git diff --check
/opt/data/bin/bun run build
```

Model evals do not apply. This work changes browser, API, database, and OAuth behavior. It does not change prompts, tools, retrieval, memory, models, or agent decisions.

## Acceptance criteria

- [ ] A normal OAuth MCP opens authorization in a new tab and completes without replacing the MCP settings page.
- [ ] The original MCP page shows the connected state after automatic OAuth completes.
- [ ] A manual-mode MCP uses the exact configured callback URL in client registration, authorization, and token exchange.
- [ ] Pasting a valid final callback URL completes OAuth and marks the correct MCP as connected.
- [ ] A callback with a missing, malformed, mismatched, replayed, expired, or foreign-user state is rejected.
- [ ] A pasted URL whose origin or path differs from the frozen callback URL is rejected.
- [ ] MiniScira never logs or returns OAuth tokens, client secrets, PKCE verifiers, authorization codes, or the complete pasted callback URL.
- [ ] Changing callback settings clears credentials and pending OAuth material that were bound to the previous callback.
- [ ] HTTP and HTTPS MCP endpoint URLs can be added when otherwise valid.
- [ ] Unsupported schemes, credentials in URLs, fragments, and malformed endpoint URLs are rejected by the API.
- [ ] The UI clearly warns before saving or using an HTTP MCP endpoint.
- [ ] Existing MCP servers continue to use automatic callback mode after migration.
- [ ] Existing encrypted OAuth credentials and tokens remain readable when callback settings are unchanged.
- [ ] The real automatic and manual user flows are exercised in a browser.
- [ ] Production deployment preserves existing users, chats, uploads, MCP records, encrypted credentials, database volume, and uploads volume.

## Deployment

- Back up Stack 30 Compose, environment, running image IDs, and the database before migration.
- Build a unique candidate image.
- Apply the committed migration through the explicit migration command.
- Exercise automatic OAuth, manual pasted-callback OAuth, and an HTTP LAN MCP endpoint in scratch or production-safe test records.
- Run the required Docker Sandbox acceptance because the full production app image changes.
- Deploy the verified immutable image while preserving Stack environment and external volumes.
- Verify the rendered MCP settings and both callback flows. Health endpoints alone are not sufficient.
- Commit and push all production-backed repository changes. Verify local `HEAD` equals `origin/main`.

## Observability

- Log only safe OAuth stage names and internal MCP IDs.
- Do not log authorization URLs, callback URLs with query strings, codes, tokens, secrets, or PKCE material.
- Return stable, non-sensitive error categories to the UI.
- Confirm the app has no unexpected restarts or OAuth callback errors after deployment.

## Rollback

- Restore the previous application image and Stack Compose while preserving environment and external volumes.
- Restore the database backup if the migration cannot remain safely in place with the previous image.
- Do not delete MCP records or encrypted credentials as a rollback shortcut.

## Open questions

None. The product decisions in this PRD are ready for approval.
