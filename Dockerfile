# syntax=docker/dockerfile:1
#
#   docker build -t miniscira .
#   docker build --build-arg IMAGE_PLATFORM=linux/amd64 -t miniscira .
#
# Platform notes:
#
# 1. **Default target is amd64.** @firecrawl/pdf-inspector ships prebuilt NAPI
#    addons for linux-x64-gnu, darwin-arm64 and win32-x64-msvc. There is no
#    linux-arm64 binary, so a NATIVE arm64 build fails during `next build`
#    with "Cannot find native binding". The platform is therefore a build arg
#    (`IMAGE_PLATFORM`, default linux/amd64): on an ARM host, build amd64
#    under emulation (which works) or build a different target if the native
#    dependency situation ever changes upstream.
#
# 2. **Node runs the build, Bun only installs.** Under Docker's amd64 emulation
#    on an Apple Silicon host, Bun crashes with SIGILL partway through
#    `next build`. Node has no such problem, so Bun is confined to
#    `bun install` and everything else runs on Node. On a native amd64 host
#    either would work; this way one Dockerfile covers both.

# Node 24 or newer: the eve CLI refuses to run on anything older.
ARG NODE_IMAGE=node:24-bookworm-slim
# Target platform for the FROM lines. This is a MANUAL build arg (not BuildKit's
# automatic $TARGETPLATFORM): plain `docker build` with no flags produces the
# amd64 image on any host, and `--build-arg IMAGE_PLATFORM=...` overrides it.
# docker-compose.yml passes the same value as a build arg AND as the service
# `platform:`, keeping build and runtime arches in sync.
ARG IMAGE_PLATFORM=linux/amd64

# ---- deps ---------------------------------------------------------------
FROM --platform=${IMAGE_PLATFORM} ${NODE_IMAGE} AS deps
WORKDIR /app
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun

COPY package.json bun.lock ./
# The postinstall script runs the `fumadocs-mdx` CLI, which needs
# source.config.ts and the content it points at.
#
# next.config.ts is required here too, and not for its contents: the CLI decides
# whether it is in a Next.js or a Vite project with a bare
# `existsSync("next.config.ts")` on the working directory. Without the file it
# takes the Vite branch and dies with "Cannot find package 'vite'".
COPY source.config.ts next.config.ts ./
COPY content ./content
# deps stage: installs from the committed bun.lock, frozen so an inconsistent
# lock fails the build instead of being silently re-resolved. The lock carries
# the self-hosted patch deps (pg, @ai-sdk/openai, @types/pg); @vercel/blob is
# no longer a root dependency (any remaining lock records are transitive).
RUN bun install --frozen-lockfile

# ---- builder ------------------------------------------------------------
FROM --platform=${IMAGE_PLATFORM} ${NODE_IMAGE} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# Build-time placeholders only. Next collects page data for every route, which
# constructs the better-auth instance; it throws on the default secret. These
# never reach the runner — ENV does not cross a FROM boundary — and the real
# values are supplied at `docker run`.
ENV BETTER_AUTH_SECRET=build-time-placeholder-not-a-real-secret
ENV BETTER_AUTH_URL=http://localhost:3000
# eve build evaluates the agent module, whose import chain calls
# gatewayBaseUrl() (fail-fast since Phase 0/1). A syntactically valid
# placeholder satisfies module evaluation; the real value is supplied at run.
ENV AI_GATEWAY_BASE_URL=http://localhost:3000/v1

# Phase 3: build-time default chat model, inlined by Next into the CLIENT
# bundle as NEXT_PUBLIC_DEFAULT_CHAT_MODEL (the picker's initial selection).
# Server-side defaults read DEFAULT_CHAT_MODEL from the RUNTIME environment,
# which wins over this build-time value — a deployment that only sets
# DEFAULT_CHAT_MODEL at run time needs no rebuild. Unset arg = built-in
# default (gpt-5.6-sol) baked in.
ARG DEFAULT_CHAT_MODEL=gpt-5.6-sol
ENV NEXT_PUBLIC_DEFAULT_CHAT_MODEL=${DEFAULT_CHAT_MODEL}

# Both halves. `next build` does NOT build the agent — skip the first line and
# the app renders fine but every chat hangs on send.
RUN node node_modules/eve/bin/eve.js build
RUN node node_modules/next/dist/bin/next build

# ---- runner -------------------------------------------------------------
FROM --platform=${IMAGE_PLATFORM} ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# The eve sandbox backs `run_code` with the just-bash backend (this host does
# not expose a docker socket to app containers): sandbox commands are plain
# bash subprocesses, so the analysis stack must live in this image — pandas,
# numpy, matplotlib get baked in at build time rather than installed at
# bootstrap (which would need egress and would re-run on every start).
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip \
 && rm -rf /var/lib/apt/lists/* \
 && python3 -m pip install --no-cache-dir --break-system-packages pandas numpy matplotlib

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
# The agent's build output is `.output/` (a Nitro bundle), NOT `.eve/` — `.eve/`
# is dev-server cache and traces. `eve start` looks for
# .output/server/index.mjs and exits immediately without it, which leaves the
# UI serving normally while every chat 404s on the rewrite.
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/public ./public
COPY --from=builder /app/.source ./.source
COPY --from=builder /app/package.json ./package.json
# next.config.ts is loaded at runtime by `next start`, and it loads the fumadocs
# plugin — which reads source.config.ts and content/. All three must be present
# in the runner or /docs 500s. next.config.ts is also what installs the
# /eve/v1/* rewrite, so without it every chat 404s.
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/source.config.ts ./source.config.ts
COPY --from=builder /app/content ./content
# eve resolves the application root from these when it starts.
COPY --from=builder /app/agent ./agent
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/tsconfig.json ./tsconfig.json
# Manual schema bootstrap (Phase 2 will formalize this as a one-shot
# migration service): `node node_modules/drizzle-kit/bin.cjs push` reads
# drizzle.config.ts from the app root and DATABASE_URL from the environment.
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
# Phase 2 runtime: supervised entrypoint (db wait + gated push + eve/next
# supervision), the two-process supervisor, and the one-shot migration runner.
# lib/ (with lib/db/migrations) is copied above; scripts/ must be too.
COPY --from=builder /app/scripts ./scripts

EXPOSE 3000

# Readiness = BOTH halves answer: /api/health (Next up AND database responds,
# SELECT 1) and /eve/v1/health (eve agent runtime ready — returned by the
# nitro health route, `{ok:true,status:"ready"}`). A healthy container means
# chat actually works, not merely that Next is listening. Used by
# docker-compose.yml and any orchestrator that reads the image HEALTHCHECK;
# inert when run without a healthcheck config.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "Promise.all([fetch('http://localhost:3000/api/health'),fetch('http://localhost:3000/eve/v1/health')]).then(rs=>process.exit(rs.every(r=>r.ok)?0:1)).catch(()=>process.exit(1))"

# Two processes. 4274 is the port withEve rewrites to when VERCEL is unset.
# Phase 2: the entrypoint waits for the database, honors the RUN_DB_PUSH gate,
# then starts BOTH halves under two-process supervision — either half dying
# takes the container down (with its exit code) so restart policies work.
CMD ["node", "scripts/entrypoint.mjs"]
