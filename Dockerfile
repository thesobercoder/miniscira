# syntax=docker/dockerfile:1
#
#   docker build --platform linux/amd64 -t miniscira .
#
# Two constraints shape this file:
#
# 1. **amd64 only.** @firecrawl/pdf-inspector ships prebuilt NAPI addons for
#    linux-x64-gnu, darwin-arm64 and win32-x64-msvc. There is no linux-arm64
#    binary, so an arm64 image fails during `next build` with "Cannot find
#    native binding".
#
# 2. **Node runs the build, Bun only installs.** Under Docker's amd64 emulation
#    on an Apple Silicon host, Bun crashes with SIGILL partway through
#    `next build`. Node has no such problem, so Bun is confined to
#    `bun install` and everything else runs on Node. On a native amd64 host
#    either would work; this way one Dockerfile covers both.

# Node 24 or newer: the eve CLI refuses to run on anything older.
ARG NODE_IMAGE=node:24-bookworm-slim

# ---- deps ---------------------------------------------------------------
FROM --platform=linux/amd64 ${NODE_IMAGE} AS deps
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
# deps stage: the lockfile is regenerated on first build because the self-hosted
# patch adds deps (pg, @ai-sdk/openai, @types/pg) that are not in the shipped
# bun.lock. Subsequent builds reuse the resolved lock.
RUN bun install

# ---- builder ------------------------------------------------------------
FROM --platform=linux/amd64 ${NODE_IMAGE} AS builder
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

# Both halves. `next build` does NOT build the agent — skip the first line and
# the app renders fine but every chat hangs on send.
RUN node node_modules/eve/bin/eve.js build
RUN node node_modules/next/dist/bin/next build

# ---- runner -------------------------------------------------------------
FROM --platform=linux/amd64 ${NODE_IMAGE} AS runner
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

EXPOSE 3000

# Two processes. 4274 is the port withEve rewrites to when VERCEL is unset.
CMD ["sh", "-c", "node node_modules/eve/bin/eve.js start --port 4274 & exec node node_modules/next/dist/bin/next start"]
