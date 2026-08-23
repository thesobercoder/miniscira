# Draft PRD: mobile layout and installable web app

**Status:** Draft. Requires explicit user approval before implementation.
**Backlog source:** [Mobile layout and installable web app](../docs/PRODUCT_IDEAS.md)

## 1. Summary

MiniScira already works at narrow screen widths, but the mobile navigation is incomplete. The desktop sidebar is replaced by a mobile sheet, yet the main content does not show a persistent control that opens it. A mobile user can therefore lose access to New research, chats, Projects, Lookouts, MCP Servers, and account actions.

MiniScira should also support installation from the browser to the iOS or Android home screen. It should use the standard web app manifest, app icons, standalone display mode, and safe offline behavior.

This work has two parts:

1. Make the current product layout fully usable on mobile, starting with a visible sidebar button.
2. Make MiniScira an installable progressive web app (PWA). A PWA is a website that browsers can install and launch like an app.

## 2. Goals

- Show a clear sidebar button on every authenticated mobile route.
- Open the existing mobile sidebar sheet from that button.
- Keep all primary product routes usable on narrow screens and touch devices.
- Provide complete install metadata and app icons for iOS and Android.
- Launch an installed MiniScira app in standalone display mode.
- Provide a safe offline app shell without pretending that research, chat, or account data works offline.
- Keep the solution canonical to Next.js and the web platform.

## 3. Product decisions

These decisions are locked for the draft.

### 3.1 Mobile navigation

- Mobile means a viewport below the existing sidebar desktop breakpoint.
- Show a persistent menu button at the top-left of the main content on authenticated routes.
- Reuse `SidebarTrigger`, `SidebarProvider`, and the existing mobile `Sheet` behavior.
- Do not create a second navigation state or a second sidebar implementation.
- The button uses the standard menu/sidebar icon and the accessible name `Open navigation`.
- The touch target is at least 44 by 44 CSS pixels.
- The button remains available after route navigation and browser Back or Forward.
- Opening the sidebar moves focus into it. Closing it returns focus to the menu button.
- Selecting a navigation item closes the mobile sidebar and navigates through the Next.js App Router.
- The control respects iOS safe-area insets and does not sit under the status bar or home indicator.

### 3.2 Installable app

- Use the canonical Next.js App Router manifest file convention.
- Add a manifest with the product name `MiniScira`, a short name, theme colors, background color, start URL, scope, icon set, and `display: "standalone"`.
- Provide at least 192×192 and 512×512 PNG icons.
- Provide maskable icon variants so Android launchers do not crop the mark badly.
- Keep the existing `apple-icon.png` and verify that it is suitable for iOS home-screen installation.
- Add the required Apple web-app metadata through supported Next.js metadata APIs.
- Do not add a custom in-product install banner in the first release.
- Users install through the browser's standard Add to Home Screen or Install App action.
- The app must work when hosted under the current deployment origin and must not assume Vercel.

### 3.3 Offline behavior

- Cache only the minimum static app shell and versioned public assets needed to show a branded offline state.
- Do not cache authenticated HTML, chat transcripts, API responses, uploaded files, generated artifacts, model output, or research results for offline use.
- When the network is unavailable, show a clear offline screen or inline state.
- The offline state says that MiniScira needs a network connection for chat, research, sign-in, Lookouts, and account data.
- Existing content must not be represented as current when it cannot be refreshed.
- Reconnect should return the user to normal online behavior without a hard-coded data reset.
- Service-worker updates must not leave the app stuck on an old shell. Define a simple update and cache-version policy before implementation.

## 4. User stories

### US-001: open navigation on mobile

**Description:** As a mobile user, I want a visible menu button so that I can reach every primary MiniScira route.

**Acceptance criteria:**

- [ ] A visible menu button appears on authenticated routes below the existing desktop breakpoint.
- [ ] The button opens the existing mobile sidebar sheet.
- [ ] The button has an accessible name and a touch target of at least 44×44 CSS pixels.
- [ ] The control is not hidden by iOS safe areas, browser chrome, or page content.
- [ ] Closing the sheet returns focus to the button.
- [ ] Browser verification covers iPhone and Android viewport sizes, portrait and landscape.

### US-002: use all primary routes on a narrow screen

**Description:** As a mobile user, I want the core product surfaces to fit and remain usable so that I can use MiniScira away from a desktop.

**Acceptance criteria:**

- [ ] New research, chat, Projects, Lookouts, MCP Servers, settings/account actions, and sign-in are reachable and usable.
- [ ] No primary action depends on hover.
- [ ] Composer controls, dialogs, drawers, pickers, timelines, tables, and forms do not overflow the viewport.
- [ ] Long titles, citations, URLs, and generated content wrap or scroll in the correct local container.
- [ ] The on-screen keyboard does not permanently hide the composer or active form control.
- [ ] Browser verification covers loading, empty, success, error, long-content, and active-stream states.

### US-003: install MiniScira on iOS and Android

**Description:** As a user, I want to add MiniScira to my home screen so that I can launch it like an app.

**Acceptance criteria:**

- [ ] The manifest is valid and available on the deployed origin.
- [ ] Android browser install criteria pass on a secure origin.
- [ ] iOS Add to Home Screen uses the correct name, icon, theme, and standalone presentation.
- [ ] The installed app opens within the configured scope and start URL.
- [ ] App icons remain recognizable under Android mask shapes and iOS rounded-square treatment.
- [ ] No Vercel-only feature is required.

### US-004: fail clearly while offline

**Description:** As a user with no connection, I want an honest offline state so that I know which actions cannot work.

**Acceptance criteria:**

- [ ] Opening the installed app without a network shows the offline shell instead of a browser error page when the shell was previously cached.
- [ ] Chat, research, sign-in, Lookouts, uploads, and account data are not reported as available offline.
- [ ] No authenticated response or private user data is stored in a public cache.
- [ ] Returning online restores normal navigation and requests.
- [ ] Service-worker update and rollback tests pass.

## 5. Functional requirements

- **FR-1:** Add one mobile navigation trigger inside the authenticated app shell.
- **FR-2:** The trigger must call the existing sidebar context action.
- **FR-3:** The mobile sidebar must close after successful route selection.
- **FR-4:** Mobile navigation must use App Router APIs and must not reload the document.
- **FR-5:** Primary authenticated routes must fit supported narrow viewports without horizontal page overflow.
- **FR-6:** Interactive mobile targets must meet the 44×44 CSS-pixel minimum where the control is used by touch.
- **FR-7:** Add a standards-compliant web app manifest through the installed Next.js file convention.
- **FR-8:** Add standard and maskable 192×192 and 512×512 PNG icons.
- **FR-9:** Add supported Apple home-screen metadata and verify the Apple touch icon.
- **FR-10:** Installed display mode must be standalone.
- **FR-11:** Add a minimal service worker only if required for the agreed offline shell and install criteria.
- **FR-12:** The service worker must not cache private API responses or authenticated page content.
- **FR-13:** Offline messaging must clearly list unavailable online-only features.
- **FR-14:** Cache names must be versioned, and obsolete shell caches must be removed safely.
- **FR-15:** The implementation must work for self-hosted deployment and not depend on Vercel.

## 6. Non-goals

- No native iOS or Android application.
- No App Store or Play Store package.
- No offline chat, research, model execution, uploads, thread history, or artifact library.
- No background sync of prompts or messages.
- No push notifications in this feature.
- No custom install prompt, marketing banner, or onboarding tour in the first release.
- No separate mobile navigation architecture.
- No redesign of desktop navigation.

## 7. Design requirements

- Reuse current MiniScira tokens, controls, icon style, spacing, and motion.
- The mobile trigger should feel like part of the app shell, not a floating decorative button.
- Keep a clear content hierarchy at narrow widths.
- Use drawers or sheets only where the existing product pattern already uses them.
- Preserve keyboard access, visible focus, screen-reader labels, contrast, and reduced-motion behavior.
- Test at 320, 375, 390, 430, and 768 CSS-pixel widths.
- Test portrait and landscape where the available height changes interaction behavior.

## 8. Technical requirements

- Inspect the installed Next.js documentation before implementation.
- Reuse `components/ui/sidebar.tsx` and its mobile sheet state.
- Keep sidebar state owned by `SidebarProvider`.
- Use Next.js metadata and manifest file conventions. Do not hand-build duplicate metadata endpoints.
- Confirm the production access model before claiming install support. Browser installation and service workers normally require HTTPS or a browser-trusted local development origin. `http://umbrel.local:8325` may not meet full install criteria on every mobile browser.
- If trusted HTTPS is required, document it as a deployment prerequisite. Do not weaken browser security or add certificate workarounds inside MiniScira.
- Use the smallest maintained service-worker approach compatible with the installed Next.js version. Do not add a broad PWA framework unless the offline-shell requirements prove it is needed.
- Define cache allowlists. Never use a broad cache-first rule for authenticated routes or APIs.

## 9. Security and privacy

- Do not cache session endpoints, auth pages after sign-in, API JSON, Eve events, uploads, artifacts, or user-specific HTML.
- Do not place secrets, user identifiers, thread titles, prompts, or account details in the manifest or static offline page.
- Sign-out must remain effective. A cached shell must not display private content from a previous account.
- Cross-user browser tests must prove that offline behavior cannot expose another user's data.
- Service-worker scope must not exceed the MiniScira app scope.

## 10. Tests

### 10.1 Unit and component tests

Cover:

- mobile trigger visibility at the supported breakpoint;
- existing sidebar context action;
- focus return after close;
- route-selection close behavior;
- manifest values and icon references;
- offline cache allowlist and denylist;
- cache-version cleanup;
- online/offline state transitions.

### 10.2 Browser tests

Cover:

- signed-out and signed-in states;
- all primary routes at 320, 375, 390, 430, and 768 CSS pixels;
- portrait and landscape;
- mobile menu open, close, focus, route selection, Back, and Forward;
- touch and keyboard operation;
- software keyboard with composer and Lookout forms;
- streaming response and long timeline;
- install metadata inspection;
- standalone launch behavior;
- offline launch, reconnect, and service-worker update;
- light and dark themes;
- reduced motion.

### 10.3 Production acceptance

- Verify the manifest, icons, metadata, and service worker from the real self-hosted origin.
- Verify mobile navigation in a real browser against production.
- Verify Add to Home Screen on one current iOS Safari device and installation on one current Android Chromium browser.
- Launch both installed apps from the home screen.
- Confirm standalone display, correct icon, correct name, authentication, navigation, and online recovery.
- Confirm no private response appears in Cache Storage.

Model evals do not apply because this feature does not change agent behavior, prompts, tools, retrieval, memory, or model routing.

## 11. Deployment and rollback

### Deployment

1. Approve this PRD.
2. Resolve the HTTPS and offline-scope questions.
3. Create exact TODOs and test mappings.
4. Fix mobile navigation and complete responsive browser checks.
5. Add manifest and icon metadata.
6. Add the minimal offline shell and cache policy.
7. Test on production-like HTTPS and the real self-hosted origin.
8. Deploy progressively.
9. Verify physical iOS and Android installation.
10. Commit, push, and verify the clean source-control state.

### Rollback

- Remove or disable the service-worker registration first if it causes stale clients.
- Deploy the previous application image.
- Keep manifest/icon files only if they remain valid with the previous version; otherwise roll them back with the image.
- Provide a cache-version bump or explicit unregister path so existing clients leave a broken worker.
- No database rollback is required.

## 12. Open questions

1. Which trusted HTTPS URL should be the supported mobile installation origin for Soham's deployment?
2. Should offline support be limited to a branded offline screen, or should static unauthenticated documentation also remain readable?
3. Should the installed app start at `/`, `/chat`, or the last route saved by the browser? Recommendation: use `/` and let normal authentication and routing choose the destination.
4. Should the mobile app shell show a compact route title beside the menu button? Recommendation: omit it unless route testing shows users lose orientation.

## 13. Approval gate

Before implementation:

- [ ] The user approves this PRD.
- [ ] The supported installation origin and HTTPS requirement are resolved.
- [ ] The exact offline scope is resolved.
- [ ] Exact TODOs, test files, browser commands, physical-device checks, and rollback checks are recorded.
- [ ] Only one TODO is in progress at a time.
- [ ] The solution remains canonical, self-hosted, and simple.

## 14. Implementation handoff

The implementation agent must receive:

- This PRD as the source of truth.
- `AGENTS.md` and its linked development, planning, invariant, deployment, and Umbrel documents.
- The locked rule that the existing sidebar state and mobile sheet must be reused.
- The locked rule that offline support must never expose or falsely represent private data.
- The locked rule that this is an installable web app, not a native-app project.
- Exact TODO and verification commands created after approval.

If an ordinary Next.js or browser-platform pattern solves a requirement, use it. Do not invent a second app shell, navigation system, install system, or offline data layer.
