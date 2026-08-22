# MiniScira

![MiniScira — research that shows its working](.github/assets/banner.png)

A Docker-first, self-hosted AI research assistant that shows its work. Ask a
question and a durable backend agent searches, reads sources, delegates focused
sub-questions, runs tools, and answers with inline citations—while the browser
renders every step live instead of hiding it behind a spinner.

This repository is an independent fork focused on portable Docker deployment,
local data ownership, OpenAI-compatible gateways, and a simple user experience.
It has diverged substantially from the original project and follows its own
roadmap and release process.

## Acknowledgements

MiniScira began from [Zaid Mukaddam's original
MiniScira](https://github.com/zaidmukaddam/miniscira). Zaid created the product,
its core research experience, and much of the foundation this fork builds on.
We are grateful for that excellent work. This fork remains MIT-licensed,
preserves the original copyright notice, and independently adapts useful
upstream ideas where they fit its Docker-first architecture.

## What this fork optimizes for

- **Docker portability:** deploy with Docker Compose on a VPS, home server, NAS,
  or another Docker-capable host.
- **Self-hosted data:** Postgres/pgvector plus durable local uploads and generated
  artifacts.
- **Gateway freedom:** route model calls through an OpenAI-compatible gateway;
  no Vercel platform dependency is required.
- **Durable research:** live, reconnectable Eve sessions with persisted events,
  delegated research, citations, projects, memory, and scheduled lookouts.
- **Secure code execution:** optional sibling-container sandboxes behind a
  private, default-deny Docker middleware and egress allowlist.
- **Simple product UX:** search, memory, tools, and model routing should be
  automatic for ordinary users; infrastructure controls stay with operators.

## Architecture

MiniScira runs two application processes in one image. Next.js serves the UI and
API; Eve runs the durable agent. `withEve()` rewrites `/eve/v1/*` to Eve, keeping
the browser on one origin.

```text
Browser ──────▶ Next.js :3000 ──────▶ Postgres + pgvector
                      │
                      │ /eve/v1/*
                      ▼
                Eve agent :4274 ─────▶ OpenAI-compatible gateway
                      │
                      └───────────────▶ optional Docker sandbox
```

| Path | What lives there |
| --- | --- |
| `agent/` | Agent instructions, tools, subagents, schedules, channels, sandbox configuration |
| `app/(app)/` | Authenticated chat, projects, lookouts, settings, and MCP UI |
| `app/api/` | UI-facing API routes |
| `components/timeline/` | Live research and tool timeline |
| `lib/` | Database, auth, retrieval, storage, model catalog, event parsing |
| `docs/DEPLOYMENT.md` | Portable Docker operations, backup, restore, upgrades, and troubleshooting |
| `docs/UMBREL_SANDBOX_OPERATIONS.md` | Installation-specific Umbrel/Portainer operations |

## Docker Compose quickstart

### Prerequisites

- Docker Engine and Docker Compose v2.20+
- An OpenAI-compatible model gateway
- An `amd64` host, or an ARM host able to run the image through emulation

### Start the stack

```bash
git clone https://github.com/thesobercoder/miniscira.git
cd miniscira
cp .env.example .env
# Fill the required values described in .env.example.

docker compose build
docker compose up -d db
docker compose --profile migrate run --rm migrate
docker compose up -d app

curl --fail http://localhost:3000/api/health
curl --fail http://localhost:3000/eve/v1/health
```

Required configuration includes:

- `DATABASE_URL`
- `POSTGRES_PASSWORD` for the bundled database
- `AI_GATEWAY_BASE_URL`
- `AI_GATEWAY_API_KEY`, unless every user supplies a private key
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`

The Compose stack includes:

- MiniScira's combined Next.js + Eve image
- Postgres with pgvector
- an explicit, one-shot migration service
- durable database and upload volumes
- health checks for both application processes
- an optional Docker sandbox control plane and egress proxy

Normal startup does **not** mutate the schema. Apply committed migrations with
the `migrate` profile before deploying a new application image.

For an external Postgres service, use the supplied override instead of editing
the base file:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.external-db.yml \
  build
docker compose \
  -f docker-compose.yml \
  -f docker-compose.external-db.yml \
  --profile migrate run --rm migrate
docker compose \
  -f docker-compose.yml \
  -f docker-compose.external-db.yml \
  up -d app
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for reverse proxies, secrets,
backups, restore, upgrade/rollback, model-gateway configuration, health
semantics, and troubleshooting.

## Local development

Docker is the supported deployment path. For source development:

```bash
bun install
cp .env.example .env.local
bun run db:setup
bun run db:push
bun run dev
```

A Next.js build alone does not build or start Eve. The production Dockerfile and
entrypoint build and supervise both processes.

## Quality gates

Before opening a change or deploying an image:

```bash
bun run typecheck
bun run lint
bun test
bun run check
git diff --check
```

Agent, retrieval, prompt, model-routing, or tool changes should also run the
relevant `evals/*.eval.ts`. Docker/Eve/sandbox changes require the full sandbox
acceptance suite documented in `docs/UMBREL_SANDBOX_OPERATIONS.md`.

Read [AGENTS.md](AGENTS.md) before changing the repository. It records the
architectural and operational invariants that are easy to miss from source code
alone. See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution workflow and
[SECURITY.md](SECURITY.md) for vulnerability reports.

## Upstream policy

The fork does not depend on upstream accepting its changes. Upstream remains a
valuable source of fixes and ideas: we fetch and review new commits, then adapt
useful changes surgically around this fork's local-storage, gateway, Docker,
authentication, and deployment invariants. We do not merge large upstream
changes blindly.

## License

[MIT](LICENSE). The original copyright notice is retained.
