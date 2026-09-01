# PRD: self-hosted YouTube transcripts

- **Status:** In progress
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-self-hosted-youtube-transcripts)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Approved by Soham on 2026-08-27
- **Revision:** 2 (2026-08-27). Revision 1 planned an Invidious sidecar plus a dedicated `youtube_transcript` tool. A proof of concept on 2026-08-27 showed the Docker Sandbox reaches YouTube captions directly once two egress entries exist. This revision makes the sandbox the primary architecture and demotes the sidecar to a documented upgrade path.

## Goal

### Problem

Users share YouTube links during research. The agent can read the video page title and description through general web fetches. It cannot read the spoken content, so it answers from metadata or says it cannot watch videos.

YouTube exposes transcripts as caption tracks. The agent's sandbox already runs arbitrary Python through `run_code`. A PoC (2026-08-27, throwaway Squid and sandbox on a scratch network, since removed) proved the full path:

- `pip install yt-dlp` works through the existing egress proxy because PyPI is already allowlisted.
- With `.youtube.com` and `.googlevideo.com` added to the allowlist, `yt-dlp --skip-download --write-subs --write-auto-subs --sub-format vtt` retrieved real caption tracks for both a manual-captions video and an auto-captions video.
- Deny probes stayed intact: non-allowlisted hosts returned `403 Forbidden`.
- The installed yt-dlp (2026.08.19) warned that no impersonation target was available and still succeeded. This is the early warning for future YouTube client checks, so the image must ship `curl-cffi`.

When research needs what a specific video says, the agent loads a skill that tells it to fetch the caption track with `yt-dlp` in the sandbox, then cites the spoken content with timestamps.

The mechanism follows the existing skill pattern (`docx`, `pdf`, `xlsx`): one skill file in `agent/skills/`, one line in the core instructions' skills list, capability delivered through the existing `run_code` tool. No new Eve tool, no new service container, no database change.

## User stories

## Scope

### Product decisions

- One new skill file: `agent/skills/youtube_transcript.md`.
- The sandbox runner image bakes in pinned `yt-dlp` and `curl-cffi` versions. Generated code does not install packages at chat time.
- The egress allowlist gains exactly two entries: `.youtube.com` and `.googlevideo.com`.
- Manual captions are preferred over auto-generated. English is the default language preference. The skill states this order so the agent does not improvise it.
- Transcript text is cited as `[mm:ss]` moments so answers can point at specific parts of the video.
- If no caption track exists, the agent says so plainly. Fabricating spoken content is an eval failure.
- The researcher subagent inherits the capability through core instructions. No schedule changes.

### Accepted risk

Squid filters by domain, so `.googlevideo.com` permits caption data and video media alike. A determined generated program could download video. This deployment is single-operator on a private server with deny-by-default for every other domain, and the risk is accepted. The validation suite's deny probes guard the breadth of the exposure. The skill does not offer or document media download.

## Non-goals

- No dedicated `youtube_transcript` Eve tool and no sidecar container. The Invidious sidecar plus tool from revision 1 is the documented upgrade path if the skill approach proves unreliable in evals or in production. That upgrade keeps revision 1's SSRF boundary, output contract, and unit tests as its starting point.
- No YouTube search, trending, channel browsing, or comment reading.
- No audio download, speech-to-text, cookies, or sign-in content.
- No transcript cache, storage, or database migration.
- No published host ports and no Umbrel app-store install.

## Functional requirements

1. `agent/skills/youtube_transcript.md` exists with frontmatter description "Use when the user shares a YouTube link or asks what a specific video says." Its body states: use `run_code`, the sandbox has `yt-dlp`, do not install packages, extract the 11-character id, run the caption-fetch command shape, read the `.vtt` from `/workspace`, cite `[mm:ss]` moments, and report missing captions honestly.
2. `agent/agent.ts` lists the skill in the core skills list so routing is automatic.
3. The sandbox runner image contains pinned `yt-dlp` and `curl-cffi`. The Dockerfile records both versions.
4. `/opt/data/miniscira-sandbox-egress-proxy/squid.conf` allows `.youtube.com` and `.googlevideo.com` and nothing else new.
5. Stack 30 references the new sandbox runner image tag through `SANDBOX_DOCKER_IMAGES`.
6. `evals/youtube-transcript.eval.ts` covers routing in, routing restraint, and honest failure, and is registered in `evals/evals.config.ts` so strict mode runs it.
7. `docs/DEPLOYMENT.md` documents the two allowlist entries, the image-baked packages, and rollback.

## Technical requirements

### Data shape

No typed contract exists in this architecture. The skill defines the behavior contract instead:

- Input: one YouTube URL or bare 11-character video id, optionally with a language hint from the user's question.
- Output in the answer: spoken content cited as `[mm:ss]` moments, drawn only from the retrieved captions.
- Failure: a plain statement that no captions were found or retrieval failed. Never invented content.

### Test plan

### Skill and image checks

- The skill file parses and the skills list in `agent/agent.ts` names it.
- The sandbox image contains `yt-dlp` and `curl-cffi` at the pinned versions.

### Sandbox validation (mandatory gate)

- `MINISCIRA_VALIDATION_IMAGE=<candidate sandbox tag> /opt/data/scripts/validate-miniscira-docker-sandbox.py` returns `RESULT: ALL PASS`, including the deny probes for unrelated hosts.

### Model eval (agent behavior changes, so the live gate applies)

`evals/youtube-transcript.eval.ts` follows `social-sources.eval.ts` conventions with deterministic fixtures at the yt-dlp output boundary:

- Given a question that references a specific video, the turn loads the skill, runs the caption fetch, and the final answer cites at least one `[mm:ss]` timestamp drawn from the fixture.
- Given a question unrelated to any video, the turn makes zero caption-fetch calls.
- Given a video whose fixture has no caption track, the reply states the limitation instead of inventing content.
- Pass threshold: every assertion passes on the deployed production system through the dedicated eval account, per the standard production eval procedure. There is no partial credit rung.

### Production acceptance

1. From the signed-in production browser, ask a real question about a real video. The timeline shows the skill load and the `run_code` call, and the answer cites timestamped content from the video.
2. Repeat with a caption-less or nonexistent video. The reply states the limitation honestly and the rest of the turn completes normally.
3. Confirm from the deployed sandbox image that `yt-dlp --version` matches the pinned version and that a non-allowlisted host is denied through the proxy.
4. Record the routes, inputs, and results in the PRD completion evidence.

### Dependencies and risks

- YouTube changes break caption retrieval for third-party clients periodically. Mitigation: pin yt-dlp and curl-cffi in the image, record the versions, and treat updates as scheduled maintenance with a unique tag per bump. The PoC warning about impersonation shows this is a live surface, not a theoretical one.
- Skill routing is model behavior and can drift. Mitigation: the routing eval runs in strict mode, and the documented upgrade path is the revision 1 dedicated tool if drift persists.
- The `.googlevideo.com` exposure is broader than captions alone. Accepted above and guarded by the validation suite.

## Acceptance criteria

- [ ] `agent/skills/youtube_transcript.md` exists and the core skills list in `agent/agent.ts` names it.
- [ ] The sandbox runner image bakes pinned `yt-dlp` and `curl-cffi`; the versions are recorded in the Dockerfile.
- [ ] The egress allowlist adds only `.youtube.com` and `.googlevideo.com`; the allowlist change ships in the `miniscira-sandbox-egress-proxy` image.
- [ ] The sandbox validation script passes with `RESULT: ALL PASS` against the candidate image, deny probes included.
- [ ] Stack 30 runs the candidate sandbox image via `SANDBOX_DOCKER_IMAGES`, with the env preserved through the sanctioned update path.
- [ ] The routing eval passes on the deployed production system: skill load and caption citation on video questions, zero calls otherwise, honest failure on caption-less videos.
- [ ] Existing focused tests, full gates (`typecheck`, `lint`, `test`, `check`), task-doc checks, and `git diff --check` pass.
- [ ] Production browser acceptance passed, including the honest-failure case and the pinned-version check.
- [ ] `docs/DEPLOYMENT.md` documents the allowlist entries, the baked packages, and rollback.
- [ ] Source is committed and pushed with a clean tree and `HEAD == origin/main`.

## Deployment

1. Obtain explicit approval of this PRD.
2. Create implementation TODOs mapped to the acceptance criteria.
3. Change the allowlist and rebuild the `miniscira-sandbox-egress-proxy` image with a new tag.
4. Bake `yt-dlp` and `curl-cffi` into a candidate sandbox runner image with a unique tag.
5. Run the sandbox validation suite against the candidate. Fix and repeat until `ALL PASS`.
6. Update Stack 30 (sandbox image reference) through the sanctioned update path with env preserved.
7. Land the skill file, skills-list entry, and eval; run the full gates.
8. Run the routing eval against production and the production browser acceptance.
9. Commit and push; confirm a clean tree and `HEAD == origin/main`.

## Observability

- Review the sandbox validation output for deny-probe failures after any allowlist change.
- Review failed research turns that mention YouTube for honest-failure quality.
- Treat fabricated video content as a release blocker.

## Rollback

Revert the sandbox image reference to the previous tag, redeploy the previous egress proxy image, and remove the skill line from the core skills list. No stored data changes. The deny-probe suite re-runs after rollback.

## Open questions

### Approval gate

Do not rebuild images, change the allowlist, change Stack 30, or write skill or eval code until Soham approves this PRD. After approval, create TODOs mapped to the acceptance criteria, then implement in the deployment order above.
