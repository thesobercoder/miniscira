# PRD: responsive app layout

- **Status:** Done
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-responsive-app-layout)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Approved by Soham on 2026-08-27

## Goal

### Summary

Provide a reliable authenticated application layout across desktop and mobile viewports. Navigation must remain discoverable and usable at production mobile widths while preserving the existing desktop sidebar experience.

### Problem

Below the `md` breakpoint, the sidebar becomes a `Sheet`, but only `SidebarTrigger` currently sits inside the sidebar. At a production viewport width of 390 px, neither the sidebar nor a trigger is visible, leaving authenticated users without navigation.

### Goals

- Keep authenticated navigation visible or immediately accessible at every supported viewport size.
- Support the application's core routes without clipped, overlapping, or unreachable content.
- Make layout, navigation, and overlays usable with touch, keyboard, and assistive technology.
- Handle mobile browser safe areas and software-keyboard resizing.
- Preserve usable layout behavior through loading, empty, error, long-content, and streaming states.
- Work consistently across supported themes and reduced-motion preferences.

## User stories

Authenticated users must be able to:

- Open and close navigation on small screens.
- Move among New research, chats, Projects, Lookouts, MCP Servers, settings, account actions, and sign-in on desktop, tablet, and phone layouts.
- Identify the current route and return to primary content.
- Complete route-specific work without horizontal page overflow or controls hidden behind browser chrome, safe areas, or the software keyboard.
- Continue reading and interacting while content loads or streams.

## Scope

### Product decisions

- Treat desktop and mobile layout as one app-shell problem.
- Fix navigation access before route-specific layout defects.
- Reuse `SidebarProvider`, `SidebarTrigger`, and the existing mobile `Sheet`.
- Keep installability and offline behavior in the separate [Installable app and offline mode PRD](prd-installable-app-and-offline-mode.md).

## Non-goals

- Installability, web-app manifests, app icons, standalone display metadata, service workers, offline behavior, or caching. Those belong to [Installable App and Offline Mode](./prd-installable-app-and-offline-mode.md).
- Redesigning information architecture or adding new product routes.
- Replacing the existing sidebar primitives.

## Functional requirements

### Responsive navigation

- Reuse `SidebarProvider`, `SidebarTrigger`, and `Sheet` rather than introducing a parallel navigation system.
- At and above `md`, retain the desktop sidebar behavior and expose its existing collapse/expand control.
- Below `md`, render navigation in a `Sheet` and place a persistent, visible `SidebarTrigger` outside the hidden sidebar so it is available when the sheet is closed.
- Use the standard menu or sidebar icon and the accessible name `Open navigation` for the mobile trigger.
- Give the mobile trigger a touch target of at least 44 by 44 CSS pixels.
- The trigger must remain visible and operable at a 390 px production viewport and other supported mobile widths.
- Opening navigation must present all primary/core route links; selecting a route must navigate and close the mobile sheet.
- The active route must be identifiable in both desktop and mobile navigation.

### Core routes and content layout

- Apply the authenticated responsive shell consistently to every core authenticated route.
- Route content must use available width without causing document-level horizontal scrolling.
- Wide intrinsic content such as code, tables, long URLs, and unbroken text must wrap or scroll within a bounded content region rather than expanding the page.
- Fixed, sticky, and overlay controls must not obscure essential content or each other.

### Touch and keyboard interaction

- Interactive controls used by touch on mobile must have touch targets of at least 44 by 44 CSS pixels and adequate spacing.
- The mobile sheet must support keyboard opening, focus placement, focus containment, Escape-to-close, focus restoration, and an accessible name.
- All navigation destinations and controls must be reachable and operable without a pointer.
- Visible focus indicators must remain clear in every supported theme.

### Mobile viewport behavior

- Respect top, bottom, left, and right safe-area insets where browser/device UI can overlap the application.
- When the software keyboard opens, focused inputs and their relevant actions must remain visible or scrollable.
- Avoid assumptions based solely on static `100vh`; use viewport behavior that remains usable as mobile browser chrome and keyboards resize the visual viewport.
- Sheet and page scrolling must not create trapped, competing, or inaccessible scroll regions.

### Application states

The layout must remain navigable and structurally stable for:

- Initial and route-level loading states.
- Empty states.
- Recoverable and terminal error states.
- Long content, including code blocks and unbroken strings.
- Incrementally streaming content, without unexpected navigation displacement or uncontrolled horizontal growth.

### Themes and motion

- Navigation, surfaces, borders, text, overlays, and focus states must be legible in every supported theme.
- Honor `prefers-reduced-motion`; navigation and sheet transitions must remain understandable without relying on animation.
- Theme changes must not alter the availability or placement of navigation controls.

### UX notes

- Reuse MiniScira's existing design tokens, controls, icon style, spacing, motion, and established sheet patterns.
- Mobile navigation access should live in a stable authenticated header or equivalent persistent shell region, not inside content that may be absent, loading, or scrolled away before navigation is needed.
- The mobile trigger must not overlap route-level primary actions.
- Closing the sheet should return focus to the control that opened it.

## Technical requirements

- Keep sidebar state in its current `SidebarProvider` owner.
- Use the existing Next.js App Router navigation path.
- Use viewport and safe-area CSS primitives instead of device-specific user-agent checks.
- Contain overflow in the component that owns the long content. Do not hide document overflow globally.
- Inspect the installed Next.js documentation and adjacent app-shell code before implementation.

### Validation plan

### Unit and component checks

- Cover trigger visibility around the `md` breakpoint.
- Cover sidebar open, close, focus containment, and focus return.
- Cover route selection from the mobile sheet.
- Cover local overflow behavior where a component needs horizontal scrolling.

### Integration checks

- Exercise the authenticated app shell across New research, chats, Projects, Lookouts, MCP Servers, settings, account actions, and sign-in.
- Exercise composer controls, dialogs, drawers, pickers, timelines, tables, and forms without viewport overflow.
- Confirm that route transitions preserve the correct desktop or mobile navigation state.

### Browser and end-to-end checks

- Exercise every primary route at representative mobile, tablet, and desktop widths.
- Cover 320, 375, 390, 430, 768, 1024, and 1440 CSS pixels across the route matrix, with targeted cases at the widths relevant to each known risk.
- Test pointer, touch, keyboard, browser Back and Forward, portrait, landscape, safe areas, browser-chrome resizing, and the software keyboard on representative routes.
- Test signed-out and signed-in states, the composer and Lookout forms with the software keyboard, and streaming responses with long timelines at their relevant widths.
- Cover loading, empty, error, long-content, streaming, supported themes, and reduced motion without requiring every state at every route-width combination.
- Confirm that the document has no unintended horizontal overflow and that overlays do not hide essential controls.

### Authorization and security checks

- Confirm that signed-out users cannot see authenticated navigation or route content.
- Confirm that navigation changes do not bypass existing route authorization.

### Migration and rollback checks

- Confirm that the change needs no data migration.
- Deploy the previous application image and confirm that the prior app shell returns without stored-data changes.

### Production acceptance

- Exercise the real authenticated routes on the deployed MiniScira system in desktop and mobile browsers.
- Record the routes, viewport classes, browsers, input methods, and route states tested.
- Treat a health response or viewport resize without interaction as insufficient evidence.

### Dependencies and risks

- Depends on the behavior and accessibility of the existing `SidebarProvider`, `SidebarTrigger`, and `Sheet` primitives.
- Route-specific fixed widths or overflow rules may need remediation to conform to the shared shell.
- Mobile browser viewport and software-keyboard behavior varies by operating system and browser and requires device-level validation.

### Implementation handoff

The implementation agent must receive this PRD, `AGENTS.md`, the mapped TODO and test plan, and the observed 390 px production reproduction. The agent must preserve the existing sidebar state owner and keep the PWA and offline PRD out of scope.

Model evals do not apply because this work does not change agent behavior, prompts, tools, retrieval, memory, or model routing.

## Acceptance criteria

- [x] At a production viewport of 390 px, an authenticated user can see and activate the navigation trigger without first opening or revealing another control.
- [x] The trigger uses the standard menu or sidebar icon, has the accessible name `Open navigation`, and measures at least 44 by 44 CSS pixels.
- [x] The mobile sheet exposes every primary/core route, identifies the current route, closes after route selection, and restores focus after dismissal.
- [x] At and above `md`, the existing desktop sidebar remains available through `SidebarProvider` and its trigger behavior.
- [x] Every core authenticated route is usable at supported desktop and mobile widths with no document-level horizontal overflow.
- [x] Touch and keyboard users can open, traverse, select from, and close navigation.
- [x] Content and controls remain usable with safe-area insets and while the software keyboard is displayed.
- [x] Loading, empty, error, long-content, and streaming states do not remove navigation access or break the responsive shell.
- [x] Supported themes have readable navigation and visible focus states.
- [x] Reduced-motion mode avoids unnecessary movement while preserving state changes.

## Deployment

1. Obtain explicit approval for this PRD.
2. Create implementation TODOs that map each acceptance criterion to a check.
3. Fix app-shell navigation access first.
4. Repair route overflow and constrained-height defects.
5. Run the required checks against the production build.
6. Deploy through the normal self-hosted process.
7. Exercise the real deployed routes on desktop and mobile browsers.
8. Commit and push the verified change, then confirm a clean working tree and local `HEAD` equal to `origin/main`.

## Observability

- Review browser console errors during route and viewport checks.
- Review Next.js and Eve logs for navigation-related request or stream failures.
- Treat inaccessible controls, clipped actions, and unintended document overflow as release blockers.

## Rollback

- Deploy the previous application image if the app shell or a primary route becomes unusable.
- Revert the responsive layout changes as one release unit.
- Re-run authenticated desktop and mobile navigation checks after rollback.
- No database rollback is required.

## Open questions

- Which exact routes constitute the release-blocking core authenticated route set?
- What minimum viewport width and browser/device matrix are supported?
- Should the mobile navigation trigger remain sticky while route content scrolls, or remain in a top shell that users can readily return to?

### Approval gate

- [x] The user reviews and approves this exact PRD. Approved 2026-08-27 ("Then do the responsive layout next using poteto mode, don't digress").
- [x] Implementation TODOs map every acceptance criterion to a check.
- [x] The browser and production acceptance matrix is recorded: production MiniScira, desktop and emulated mobile, routes `/`, `/projects`, `/lookouts`, `/mcps`, `/settings`; widths 320, 390, 430 (mobile header with 44 px trigger), 768, 1024, 1440 (desktop sidebar); trigger click and Enter open the sheet; Escape closes with focus restored; route selection navigates and closes the sheet; active route marked; no document-level overflow on any tested route; dark theme and reduced motion checked at 390 px.
- [x] No installability, offline, manifest, icon, service-worker, caching, or HTTPS work is included.
