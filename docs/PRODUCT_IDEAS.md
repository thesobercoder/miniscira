# MiniScira Backlog

A deliberately empty product backlog for ideas Soham encounters while using MiniScira or evaluating other tools.

Add items only when a concrete need appears. Before implementation, turn the selected item into a focused PRD with acceptance criteria.

## Backlog

### Edit uploaded images with natural-language instructions

- Let users upload an image and describe the desired changes conversationally.
- Preserve the original and save every edited result as a new durable file.
- Support common edits such as removing or adding objects, changing backgrounds, recoloring, extending the canvas, and restyling.
- Preserve important composition, identity, and fine details when the requested edit does not change them.
- Show progress and the completed edited image directly in the conversation.
- Route automatically to a configured image-editing-capable model; do not expose provider or backend controls to ordinary users.
- Report clearly when the configured image backend supports generation only and cannot edit images.

Before implementation, verify the live gateway's image-editing endpoint and input contract, then create a focused PRD covering uploads, model routing, storage, timeline rendering, privacy, failure states, and end-to-end tests.
