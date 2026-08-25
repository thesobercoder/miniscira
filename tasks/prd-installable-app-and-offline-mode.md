# PRD: installable app and offline mode

- **Status:** Draft, awaiting approval.
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-installable-app-and-offline-mode)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)

## Summary

Make the application installable through standard browser and mobile operating-system flows, and provide a minimal, privacy-safe offline shell with explicit reconnect and update behavior.

## Problem

The application does not yet define a complete installable web-app contract across browsers and mobile platforms. Users need correct manifest and platform metadata, production-ready icons, predictable standalone launch behavior, and a minimal offline experience that never exposes or persistently caches private authenticated data.

## Product decisions

- Defer this work until after the higher-priority [Responsive app layout PRD](prd-responsive-app-layout.md).
- Use browser and operating-system installation flows. Do not add a custom install prompt in the first release.
- Keep offline support to a minimal public shell. Do not add offline access to private product data.
- Keep service-worker scope and caching rules as narrow as possible.

## Goals

- Support standard browser installation and supported mobile add-to-home-screen flows.
- Launch cleanly in standalone display mode with appropriate identity and metadata.
- Provide standard and maskable 192 px and 512 px icons plus Apple-specific metadata.
- Serve a minimal offline shell without caching private authenticated content.
- Communicate offline, reconnecting, reconnected, and update-required states clearly.
- Define cache versioning, service-worker update, deployment, and rollback behavior.
- Verify the complete install and offline experience on physical iOS and Android devices.

## Non-goals

- Authenticated desktop/mobile layout, sidebar behavior, route overflow, touch layout, safe areas, or software-keyboard behavior. Those belong to [Responsive App Layout](./prd-responsive-app-layout.md).
- Full offline access to authenticated data or offline mutation queues.
- Background synchronization, push notifications, or native-app distribution.
- Persistently caching private API responses, conversations, attachments, credentials, or personalized route documents.

## Users and use cases

Users must be able to:

- Install the application using a browser's standard install UI where supported.
- Add the application to a mobile home screen using platform-standard flows.
- Launch an installed instance in standalone mode with recognizable name, icon, colors, and start location.
- Understand when the application cannot reach the network and retry or reconnect safely.
- Receive a new application shell after deployment without remaining indefinitely on stale assets.

## Functional requirements

### Web app manifest

- Provide a valid, discoverable web app manifest from production pages.
- Define product-approved `name`, `short_name`, `description`, `start_url`, `scope`, `display`, `theme_color`, and `background_color` values.
- Use a stable `id` so installations are not duplicated when URLs or tracking parameters vary.
- Ensure `start_url` and `scope` work behind the supported production deployment path and proxy configuration.
- Define standalone display behavior without changing authentication or authorization semantics.

### Icons and Apple metadata

- Provide standard 192×192 and 512×512 PNG icons.
- Provide purpose-built maskable 192×192 and 512×512 PNG icons with artwork inside the required safe zone; do not merely relabel standard icons as maskable.
- Include correct manifest `sizes`, MIME `type`, and `purpose` declarations.
- Provide an Apple touch icon and the required Apple web-app metadata for supported iOS home-screen behavior.
- Validate that icons are not cropped, padded incorrectly, transparent where a solid background is required, or illegible at launcher size.

### Installation and standalone launch

- Satisfy supported browser installability criteria and expose no custom prompt that conflicts with standard browser install UI.
- Verify installation through standard desktop browser install flows and supported Android browser flows.
- Document the standard iOS add-to-home-screen flow rather than implying support for a browser install prompt where the platform does not provide one.
- Installed launches must open within scope, preserve normal authentication redirects, and avoid unexpected browser chrome where standalone mode is supported.
- External or out-of-scope destinations must open according to platform conventions.

### Secure delivery

- Production installability and service-worker registration must use a secure context.
- Resolve and document whether every supported deployment target provides HTTPS at the public application origin, including proxy and custom-domain cases.
- Local development may use browser-supported localhost secure-context exceptions; production must not depend on them.

### Minimal service worker and offline shell

- Register a minimal service worker only after confirming browser support and a valid production scope.
- Precache only the static assets required to render a minimal branded offline shell and reconnect affordance.
- Do not cache private authenticated HTML, API responses, conversations, search or memory results, attachments, credentials, authorization headers, or user-specific data.
- Network requests for authenticated or private resources must remain network-only and fail closed when offline.
- The offline shell must clearly state that the application is offline and that private content is unavailable rather than displaying stale or misleading data.
- The service worker must not interfere with streaming responses, authenticated navigation, uploads, downloads, or application API error semantics.

### Offline and reconnect behavior

- Detect loss and restoration of connectivity while treating browser connectivity signals as advisory rather than proof that the application backend is reachable.
- Present a clear offline state and an explicit retry/reconnect action.
- On reconnect, revalidate the active route through normal authenticated network requests instead of replaying cached private content.
- Preserve safe local UI state only when it does not contain private server data and does not imply that an operation succeeded.
- Failed mutations must remain visibly failed or retryable; they must not be silently queued unless a separately approved design adds that capability.

### Cache versions and updates

- Version precached shell assets so each deployment can distinguish old and new caches.
- During service-worker activation, remove only obsolete caches owned by this application.
- Define whether updates activate immediately or wait for user acknowledgement; avoid reloading while the user is composing input or an operation is active.
- Ensure controlled clients converge on the current shell after a successful update without update loops.
- Surface a recoverable refresh action when a new shell requires reload.
- Keep the previous deployable application version available long enough to support rollback while avoiding incompatible shell/API combinations.

## Technical requirements

- Use the installed Next.js version's supported metadata and manifest conventions.
- Define explicit cache allowlists and denylists.
- Keep authenticated routes and APIs network-only.
- Version cache names and remove only obsolete caches owned by MiniScira.
- Keep the service-worker scope within the MiniScira application scope.
- Define a tested path that disables or unregisters a faulty worker.

## Security and privacy requirements

- Do not put secrets, user identifiers, thread titles, prompts, or account details in the manifest or offline shell.
- Do not cache session endpoints, authenticated pages, API JSON, Eve events, uploads, artifacts, transcripts, or generated output.
- Keep sign-out effective while a service worker is registered.
- Prove that an offline shell cannot display private content from another account.
- Inspect Cache Storage and require that it contains only approved public shell assets.

### Deployment and rollback

- Deploy manifest, icons, metadata, service-worker script, and referenced shell assets atomically or in a backward-compatible sequence.
- Serve the service-worker script with headers that permit timely update checks and prevent an indefinitely stale worker.
- Ensure manifest, icon, and worker paths function through the production proxy/base path.
- Define a rollback procedure that can unregister or neutralize a faulty worker, invalidate its caches, and restore a compatible shell.
- Rollback must not require users to manually clear all browser data.
- Monitor registration failures, installability diagnostics, offline-shell errors, and update-loop symptoms after release.

## UX notes

- Prefer native browser/platform installation affordances. Any in-app educational affordance must be dismissible, platform-aware, and must not claim installation is available when it is not.
- Offline messaging must distinguish unavailable network content from an empty account or an application error.
- Update messaging should interrupt users only when required for correctness or security.

## Acceptance criteria

- The production manifest passes browser validation and contains complete identity, scope, display, color, and icon metadata.
- Standard and maskable 192×192 and 512×512 icons render correctly; Apple metadata and touch icon are recognized on supported iOS devices.
- The app can be installed through standard supported desktop and Android browser flows and added to the home screen on physical iOS.
- Installed launches use standalone mode where supported, remain in scope, and preserve normal authentication behavior.
- The HTTPS requirement and support status for every deployment target are documented and verified before enabling the service worker in production.
- With the network unavailable, the minimal offline shell loads and no private authenticated response or user content is read from a service-worker cache.
- Reconnect and retry return the user to normally authenticated, freshly fetched content; failed operations are not falsely reported as successful.
- A new deployment updates cache versions without loops or uncontrolled mid-task reloads.
- A faulty worker can be rolled back or neutralized without asking users to manually clear browser storage.
- Installation, standalone launch, offline, reconnect, update, and rollback are checked on physical iOS and Android devices.

## Validation plan

### Unit and component checks

- Validate manifest values and icon references.
- Cover offline-state content, cache allowlists and denylists, cache-version cleanup, and online and offline transitions.

### Integration checks

- Cover manifest delivery, service-worker registration, scope, cache creation, activation cleanup, offline fallback, reconnect, and sign-out.

### Browser and end-to-end checks

- Inspect install metadata and Cache Storage in supported desktop and mobile browsers.
- Test standalone launch, offline launch, reconnect, worker update, and worker rollback.
- Test installation and home-screen launch on one current physical iOS device and one current physical Android device.

### Authorization and security checks

- Prove that the service worker never returns one user's private response to another user.
- Verify signed-out launch, expired sessions, sign-out, and denied authenticated requests while offline.

### Migration and rollback checks

- Confirm that the change needs no database migration.
- Test service-worker removal, cache cleanup, previous-image deployment, and recovery for clients that loaded a faulty worker.

### Deployment and production acceptance

- Verify the real supported HTTPS self-hosted origin.
- Install and launch MiniScira from the deployed system on physical iOS and Android devices.
- Test online launch, offline launch after shell caching, reconnect, authentication, icon appearance, standalone display, update, privacy, and rollback.

## Dependencies and risks

- Depends on approved production brand assets and metadata.
- Depends on secure HTTPS delivery and correct proxy handling for every supported production origin.
- Service-worker mistakes can persist across deployments, intercept sensitive requests, or strand users on stale assets; scope and caching rules must remain minimal.
- iOS and Android installation and lifecycle behavior differ and cannot be fully validated through desktop emulation alone.

## Open questions

- Do all supported production, custom-domain, and self-hosted deployment paths terminate HTTPS at the public application origin?
- What exact product name, short name, description, theme color, background color, and icon artwork are approved?
- Should an available update activate on the next clean navigation, after explicit user confirmation, or under another safe policy?
- Which desktop and mobile browser versions define the supported installability matrix?

## Deployment

1. Complete and verify the separate responsive layout work.
2. Obtain explicit approval for this PRD.
3. Resolve the supported HTTPS origin, start URL, scope, and offline-shell content.
4. Create implementation TODOs that map each acceptance criterion to a check.
5. Add and validate the manifest, metadata, and icons.
6. Add the minimal service worker, offline shell, cache policy, and update policy.
7. Deploy through the normal self-hosted process.
8. Run physical-device installation, offline, update, reconnect, privacy, and rollback acceptance.

## Observability

- Review service-worker install, activation, fetch, and update failures in browser developer tools.
- Review Cache Storage during online, offline, sign-out, update, and rollback checks.
- Review Next.js and proxy logs for failed manifest, icon, and worker requests.
- Treat private cache entries, stale-worker loops, failed reconnects, and incorrect install identity as release blockers.

## Rollback

- Disable or unregister the service worker if it traps clients on stale assets.
- Deploy the previous application image.
- Remove obsolete worker registration and caches through the tested cleanup path.
- Verify online launch, offline behavior, sign-out, Cache Storage, and installation after rollback.
- No database rollback is required.

## Approval gate

- [ ] The user reviews and approves this exact PRD.
- [ ] The responsive app layout remains separate and higher priority.
- [ ] The supported HTTPS origin, start URL, scope, and offline-shell content are resolved.
- [ ] Implementation TODOs map every acceptance criterion to a check.
- [ ] Physical-device, privacy, update, deployment, and rollback checks are recorded.

## Implementation handoff

The implementation agent must receive this PRD, `AGENTS.md`, and the mapped TODO and test plan. The agent must keep responsive layout and sidebar navigation out of scope and preserve the private-data cache restrictions.

Model evals do not apply because this work does not change agent behavior, prompts, tools, retrieval, memory, or model routing.
