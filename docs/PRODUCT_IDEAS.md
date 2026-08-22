# MiniScira Product Ideas

This is a deliberately lightweight product backlog for ideas worth adopting from other AI products. It is not an implementation plan or a commitment to ship everything listed.

## Product direction

MiniScira remains the primary product. Preserve what already makes it strong:

- a simple conversation-first interface;
- automatic web research with inline citations;
- an intelligible live research timeline;
- dependable attachments, previews, Retry, Edit, and Branch;
- self-hosting and control over model routing;
- a default experience simple enough for a 10-year-old child.

The guiding principle is:

> Power for the administrator; simplicity for the person asking the question.

Search, memory, retrieval, routing, and tool selection should normally be product behavior—not questions the user must answer before receiving help. Advanced controls should be progressively disclosed through administration and settings surfaces.

## Candidate feature backlog

### P0 — User profiles and child-safe simplicity

**Inspiration:** polished multi-user assistants and family software.

- Isolated profiles, conversations, preferences, and memories per user.
- A child profile with age-appropriate explanations and conservative safety defaults.
- Admin-published assistants with approachable names such as Homework Helper, Story Creator, and Science Explorer.
- No provider names, API terminology, tool switches, or infrastructure details in the child experience.
- Parent/admin controls remain inaccessible to child profiles.

**Why:** Swayampurna should be able to use MiniScira without understanding agents, models, tools, or search providers.

### P0 — Enhance MiniScira's existing memory

**Inspiration:** modern assistant memory controls and Hermes/Honcho-style personalization.

- Preserve MiniScira's existing memory foundation and make its behavior more automatic, transparent, and profile-aware.
- Learn durable preferences and useful context in the background.
- Keep memory isolated per profile.
- Avoid indiscriminate capture of incidental or sensitive statements.
- Provide a plain-language Settings page to review, correct, delete, pause, or clear memories.
- Show unobtrusive evidence when remembered context materially affects an answer.
- Keep automatic extraction separate from ordinary prompt context and conversation history.

**Why:** memory should improve continuity without interrupting the conversation or asking the user to configure it.

### P0 — Intent-driven search and research routing

**Inspiration:** MiniScira Deep Research, Perplexity, and modern search-native assistants.

- Use ordinary web search automatically for current, uncertain, or externally verifiable claims.
- Prefer authoritative primary sources and retain inline citations.
- Answer stable/basic questions directly when search adds no value.
- Escalate automatically to multi-step research when complexity or source disagreement warrants it.
- Retain an explicit Deep Research mode only when the user intentionally wants a slower, broader investigation.
- Never ask the generic question “Do you want web search?” as part of normal use.

**Why:** web access is baseline agent behavior; only materially higher effort needs an explicit choice.

### P1 — Admin-created assistants

**Inspiration:** configurable agent and custom-assistant products.

- Admin UI for creating assistants with a name, avatar, purpose, instructions, preferred model policy, knowledge, and allowed tools.
- Publish selected assistants to selected user profiles.
- Sensible templates rather than exposing raw prompts first.
- Version assistant definitions and make rollback possible.
- Keep the default general assistant useful without any configuration.

**Why:** gain configurable assistants without making ordinary users manage agents.

### P1 — Progressive disclosure and diagnostics

**Inspiration:** professional self-hosted administration products.

- Simple chat surface for ordinary users.
- Advanced Settings for models, search, memory, MCP, knowledge, and assistants.
- Admin diagnostics for provider health, search health, memory extraction, model routing, and tool failures.
- Friendly user-facing errors with detailed technical evidence available only to admins.

**Why:** operational power should not leak into the everyday UX.

### P1 — Durable knowledge and project workspaces

**Inspiration:** Claude Projects, NotebookLM, and modern file-search systems.

- Project-scoped files, instructions, conversations, and optionally memories.
- Clear distinction between personal memory and project knowledge.
- Source visibility, provenance, replacement, and deletion controls.
- Automatic retrieval without forcing the user to choose retrieval tools manually.

**Why:** support sustained school, research, and personal projects without polluting global context.

### P2 — Polished artifacts and preview

**Inspiration:** modern artifact and generative-preview systems, while avoiding deployment fragility.

- First-class previews for HTML, React, SVG, Mermaid, Markdown, code, and common documents.
- Work over ordinary supported MiniScira deployment origins; do not silently depend on browser APIs available only over HTTPS unless the deployment declares that requirement.
- Clear preview/loading/error/export states.
- Safe sandboxing and explicit network policy.
- Iterative editing through conversation.

**Why:** previews should feel native and reliable rather than like a loosely integrated third-party subsystem.

### P2 — Assistant sharing and starter experiences

**Inspiration:** agent galleries, without becoming a public marketplace.

- Admin-controlled gallery of household assistants.
- Starter prompts tailored to each assistant and user age/profile.
- Import/export assistant definitions without secrets.
- No public marketplace, monetization, ratings, or discovery feed initially.

**Why:** make advanced capability approachable while avoiding marketplace complexity.

## Explicit non-goals

- Do not clone another product’s interface or configuration model wholesale.
- Do not expose every tool as a toggle in the composer.
- Do not make users understand search providers, memory agents, MCP servers, or model-provider details.
- Do not require a separate assistant for basic useful behavior.
- Do not add a marketplace before household administration and profile isolation are excellent.
- Do not compromise MiniScira’s existing research UX or deployment security to match another product’s feature checklist.

## Prioritization rule

Before promoting an idea into a PRD, score it on:

1. User value for Soham and family.
2. Simplicity for a child user.
3. Whether it can remain automatic or progressively disclosed.
4. Fit with MiniScira’s existing architecture and research strengths.
5. Privacy and profile isolation.
6. Reliability under self-hosted Umbrel constraints.
7. Implementation and ongoing maintenance cost.

Create a dedicated PRD and execution packet before implementation. Work on one coherent product slice at a time, starting with profile isolation, automatic memory, and intent-driven search behavior.