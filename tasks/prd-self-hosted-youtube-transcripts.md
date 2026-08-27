# PRD: self-hosted YouTube transcripts

- **Status:** To do
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-self-hosted-youtube-transcripts)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Not approved

## Problem

Users share YouTube links during research. The agent can read the video page title and description through general web fetches, but it cannot read the spoken content. It answers from metadata or says it cannot watch videos.

YouTube exposes transcripts as caption tracks. A self-hosted reader can retrieve those captions from the user's own Umbrel server instead of depending on another hosted extraction API.

## Goal

Give the agent a `youtube_transcript` tool that reads the caption track of one YouTube video through a self-hosted service running on Soham's Umbrel, so research answers can use what the video actually says.

The feature follows the existing self-hosted pattern: an environment-gated internal service URL consumed by one focused Eve tool, the same shape used by `reddit_search` with `SEARXNG_URL`.

## Primary source choice

Use Invidious self-hosted on Umbrel as the primary transcript source:

1. It ships as an Umbrel app, so it reuses the platform's packaging and updates.
2. Its HTTP API returns caption tracks (`/api/v1/captions/<videoId>`) including auto-generated tracks as WebVTT.
3. MiniScira talks to it over the local network with no third-party dependency added to the app image.

Before implementing the tool, verify Invidious on the real Umbrel: install it, confirm the captions endpoint works for representative videos with manual and auto-generated captions, and record the result. If the captions endpoint proves unreliable at that checkpoint, stop and report instead of silently switching to a different architecture. A yt-dlp sidecar container is the documented fallback decision for a future revision, not an implementation-time substitution.

## User stories

- As a user, I can paste a YouTube link and have the agent answer using the video's spoken content with timestamps.
- As a user researching several videos, the agent reads each transcript on demand instead of guessing from titles.
- As the operator, the transcript reader stays fully inside my home server and behind my own network boundary.
- As the operator, MiniScira still works normally when the transcript service is stopped or absent.

## Product decisions

- One new Eve tool: `youtube_transcript`.
- One video per call. Playlists are rejected.
- Captions only: manual tracks first, then auto-generated tracks. Prefer the requested language, then English, then the first available track.
- No audio download, media processing, or speech-to-text. If no caption track exists, the tool returns a safe not-found result.
- The transcript service URL comes from a new optional environment variable: `YOUTUBE_TRANSCRIPT_URL` (for example `http://invidious_umbrel_internal:port`).
- The tool stays registered when the variable is absent and returns the same safe configuration-error shape as the other provider-gated tools.
- Transcript text is returned inline with `[mm:ss]` timestamps so answers can cite specific moments.
- The tool renders through the existing timeline tool-node styles as a read-type activity.
- The researcher subagent may use the tool for delegated work.

## Non-goals

- No YouTube search, trending, channel browsing, comment reading, or thumbnail metadata features.
- No video or audio download. No Whisper-style transcription.
- No cookies, sign-in, members-only, or age-restricted content bypass.
- No transcript storage, cache table, embedding pipeline, or database migration.
- No published host ports or Umbrel proxy exposure for Invidious. It stays on the internal Docker networks.
- No new uptime monitoring, alerting, or dashboard UI for the service.
- No batch fetching. Eve may issue repeated single-video calls when research requires them.

## Data shapes

Input:

```text
YouTubeTranscriptRequest
- video: one YouTube URL or bare 11-character video ID
- language: optional BCP-47 language tag hint (default: prefer English)
```

Output:

```text
YouTubeTranscriptResult
- videoId: resolved 11-character id
- language: caption language actually returned
- source: "manual" | "auto"
- segments: [{ startSeconds, durationSeconds, text }]
- text: full "[mm:ss] text" rendition, capped with a truncated flag
- error: optional safe message (configuration | invalid-input | not-found | unavailable)
```

Validation mirrors the strictness of `github_search`: parse input as a URL with hostname `youtube.com`, `www.youtube.com`, `youtu.be`, or `m.youtube.com`, extract `v=`, `shorts/`, `embed/`, or the youtu.be path segment, or accept a literal `[A-Za-z0-9_-]{11}` id. Reject everything else, including playlists, extra query parameters carried into the upstream request, credentials-in-URL forms, and non-http(s) schemes. Outbound requests go only to the configured `YOUTUBE_TRANSCRIPT_URL`.

## Functional requirements

1. `youtube_transcript` accepts one video reference plus an optional language hint.
2. With `YOUTUBE_TRANSCRIPT_URL` set, the tool resolves the video id, requests the caption track list, downloads the best matching track, converts WebVTT to timestamped text, and returns it.
3. Manual captions outrank auto-generated ones; language hint beats English beats first-available.
4. Total returned text is capped at 150,000 characters. Larger transcripts end with `truncated: true` and a clear cut point; no silent drops mid-segment.
5. Missing configuration, network failure, timeout, malformed responses, missing captions, and unknown videos each map to their stable safe error value. Nothing throws raw provider bodies into the conversation.
6. Config absence yields a registered tool with a configuration guidance message, consistent with `github_search` behavior when Firecrawl keys are absent.
7. Video pages fetched indirectly (title lookup) remain the job of the existing web tools; this tool adds caption retrieval only.
8. `agent/instructions/00-core.md` documents when to reach for `youtube_transcript` (any explicit or implied need for what a specific video says), keeping routing automatic per repository principle.
9. `components/timeline/parts.ts` maps the tool to a read-type icon label so it renders in the research timeline.
10. Lookouts receive the capability automatically because they share core instructions; no schedule changes are made.

## Technical requirements

- Follow the existing `defineTool` pattern in `agent/tools/`; no SDK dependency for Invidious, plain `fetch`.
- Timeouts: connect ≤ 5 s, headers ≤ 10 s, full caption fetch ≤ 30 s; one retry on transient connect failure, then the stable error.
- Treat all caption text and the track list as untrusted source data, subject to the same instruction-injection stance as every retrieved document.
- Never log or store caption contents in application logs; timeline persistence of tool results follows existing event handling unchanged.
- WebVTT conversion lives in a small unit-tested module under `lib/` (parse cues, strip markup tags in cue text, resolve overlapping cues deterministically).
- Document `YOUTUBE_TRANSCRIPT_URL` in `docs/DEPLOYMENT.md` next to `SEARXNG_URL`, including the Umbrel setup recipe below.

### Umbrel deployment recipe (documentation deliverable)

1. Install Invidious from the Umbrel app store (or an equivalent private Portainer stack if the store build lacks captions support), pinned to the version verified at the checkpoint.
2. Attach Invidious to the `miniscira` stack network (or publish only on the LAN interface) so the Eve container reaches it; never expose it through the Umbrel reverse proxy or any WAN path.
3. Set `YOUTUBE_TRANSCRIPT_URL=http://<internal-host>:<port>` in Stack 30's preserved environment and recreate services with env intact.
4. Record the deployed image digest alongside the Stack 30 backup convention.
5. Stopping or removing Invidious must leave MiniScira healthy with the tool reporting the unavailable state.

## Test plan

### Unit tests

- `lib/youtube-url.test.ts`: accepted and rejected video references (all four URL shapes, bare id, playlist rejection, malformed ids, hostile schemes).
- `lib/webvtt.test.ts`: real-shape fixtures for manual and auto captions; cue parsing, tag stripping, overlap resolution, empty tracks, huge-file truncation math.
- `agent/tool-tests/youtube_transcript.test.ts`: config-absent error shape; mocked Invidious happy path; every listed failure mode; language/source selection priority; 150k-character cap behavior.

### Model evals

Add `evals/youtube-transcript.eval.ts` following `social-sources.eval.ts` conventions:

- Given a research question referencing a specific video, the turn calls `youtube_transcript` exactly once and cites moment-level content from the returned text in the final answer.
- Given a question about a nonexistent or caption-less video, the reply reports the limitation instead of fabricating content.
- Given unrelated queries, the tool is not called (routing restraint).

Existing routing regressions stay green; no changes to model selection defaults.

### Production acceptance

After deployment on the Umbrel host:

1. From the signed-in production browser, paste a real YouTube question and confirm the timeline shows the `youtube_transcript` node followed by an answer citing timestamped content from the deployed Invidious instance.
2. Stop the Invidious container, repeat once, and confirm the tool surfaces the unavailable state while the rest of the turn completes normally; restart the service afterward.
3. Confirm no `YOUTUBE_TRANSCRIPT_URL` traffic leaves the home network (spot-check via Invidious logs showing the two evaluation calls and no others).
4. Run the relevant production eval suite entry and record results.

## Acceptance criteria

- [ ] Invidious runs on the Umbrel host, unreachable except from the internal/LAN networks, with its image digest recorded in the Stack 30 backup.
- [ ] The caption-endpoint checkpoint on the real Umbrel passed, with its evidence recorded before tool implementation started.
- [ ] `youtube_transcript` handles URL/id inputs, language selection, manual-over-auto priority, truncation, and every safe error shape per the functional requirements.
- [ ] Unit tests cover URL parsing, WebVTT conversion, tool behavior, and degradation with the variable absent.
- [ ] The routing eval passes: right tool on video questions, restraint elsewhere, honest not-found replies.
- [ ] Existing focused tests, full gates (`typecheck`, `lint`, `test`, `check`), task-doc checks, and `git diff --check` pass.
- [ ] Production browser acceptance passed on the live deployment, including the service-stopped degradation run.
- [ ] `docs/DEPLOYMENT.md` documents the variable, the Umbrel recipe, and rollback (unset variable; remove service).
- [ ] Source is committed and pushed with a clean tree and `HEAD == origin/main`.

## Risks

- YouTube changes break caption retrieval for third-party clients periodically; pinning the verified Invidious version and recording it makes recovery a deliberate update rather than a surprise.
- Auto-generated caption quality varies by language and channel; the PRD treats them as acceptable but ranks them below manual tracks.
- Adding an Invidious instance spends modest RAM/CPU alongside existing stack 30 services; the household deployment guide's capacity notes apply.

## Rollback

Unset `YOUTUBE_TRANSCRIPT_URL`, recreate Stack 30, and redeploy the previous image. The tool remains registered in its configuration-guidance state, matching current provider-tool behavior; removing the Invidious app is independent and non-destructive to MiniScira data.

## Open questions

None blocking approval. The Invidious-vs-fallback decision resolves itself through the recorded checkpoint above.

## Approval gate

Do not install anything on Umbrel, change Stack 30, or write tool code until Soham approves this PRD. After approval, create TODOs mapped to the acceptance criteria, run the checkpoint, then implement.
