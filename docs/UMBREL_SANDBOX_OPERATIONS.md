# MiniScira on Umbrel: Docker Sandbox architecture and operations

This is the main operations runbook for Soham's MiniScira fork on Umbrel. It describes the local architecture, security boundary, build and deployment steps, upstream sync rules, required tests, rollback steps, and known failures.

> **Scope:** This design is for a personal or household deployment on one trusted Umbrel Docker Engine. The Sandbox runs as sibling containers on that Engine. This is acceptable here, but it does not isolate mutually hostile tenants.

## 1. Current production contract

| Item | Value / rule |
| --- | --- |
| Portainer stack | `30`, project/name `miniscira` |
| Browser URL | `http://umbrel.local:8325` |
| In-container host probe | `http://10.21.0.1:8325` (`umbrel.local` does not resolve inside Hermes) |
| Scratch acceptance port | `8326` |
| App image tag | `miniscira:local` (the single canonical production/sandbox tag) |
| App image ID | Inspect the live immutable ID before each operation; the tag is rebuilt in place from `origin/main`. |
| Docker middleware tag | `miniscira-docker-api-proxy:local` |
| Working middleware image ID | `sha256:06edc3230079cbde9156dd356dbd68d850c392229e77048e8edf14b1789d9801` |
| Egress proxy tag | `miniscira-sandbox-egress-proxy:local` |
| Working egress image ID | `sha256:ec2506a56e65dadb7a2b2fe836d25892333b1a33b6120c43e7e8ec1fd02e574c` |
| Database | `pgvector/pgvector:pg16`; volume `miniscira_miniscira-db` |
| Uploads | volume `miniscira_miniscira-uploads` mounted at `/data/uploads` |
| Docker host socket | Umbrel host path `/data/docker.sock` |
| Middleware socket path | `/var/run/docker.sock` inside the middleware only |
| Middleware port | internal TCP `80`; no host-published port |
| Squid port | internal TCP `3128`; no host-published port |
| App Docker endpoint | `DOCKER_HOST=tcp://docker-socket-proxy:80` |
| Sandbox network | `miniscira_sandbox-egress`, Docker `internal: true` |
| Control network | `miniscira_docker-control`, Docker `internal: true` |
| Production Compose fingerprint after rollout | SHA-256 `a97f83b9fa4848ad6798931ea349b3595b81d6445c010ef39f4110b67c32794b` |

Image IDs show which exact images passed rollout tests. Local tags are mutable and may point to new images after a rebuild. Always inspect the running container's `Image` ID before and after maintenance.

## 2. Architecture in plain language

```text
Browser
  |
  | HTTP :8325
  v
MiniScira app container
  |- Next.js :3000
  |- Eve agent runtime :4274 (same-origin through /eve/v1/*)
  |- no Docker socket
  |- DOCKER_HOST=tcp://docker-socket-proxy:80
  |
  | private miniscira_docker-control network
  v
Docker API middleware
  |- the only service with /data/docker.sock mounted
  |- default-deny Docker Engine API policy
  |- allows only Eve sandbox lifecycle operations
  |- no host port
  |
  v
Umbrel / Portainer Docker Engine
  |
  +--> Eve template-build containers
  +--> Eve session containers
          |- label eve.sandbox=1
          |- attached only to miniscira_sandbox-egress
          |- no host ports, host mounts, devices, or host namespaces
          |- HTTP(S) proxy variables point to Squid
          |
          | private internal network
          v
        Squid egress proxy
          |- on sandbox-egress and normal stack default network
          |- package/source host allowlist
          |- default deny
          v
        Internet package/source registries
```

### What "runs directly on Umbrel" means

This is not Docker-in-Docker. Eve asks the normal Umbrel Docker Engine to create short-lived sibling containers. The sandboxes use CPU and memory directly on the Umbrel host, and Portainer can see them.

MiniScira itself does **not** receive the Docker socket. It can reach only the
private middleware. The middleware is the component with direct Engine access.

### Why MiniScira does not use Portainer's endpoint proxy

Portainer's authenticated endpoint proxy was tested first. Normal Docker attached
`exec` requires an HTTP upgrade response (`101 UPGRADED`) and a bidirectional byte
stream. The Portainer path returned `200` or `502`, causing:

```text
unable to upgrade to tcp, received 200
```

The direct-socket middleware preserves Docker's native stream and keeps a policy layer between MiniScira and the Engine. The MiniScira container has no Portainer token.

## 3. Service and network boundaries

### `app`

- On `miniscira_default` for DB, gateway, Firecrawl, and normal app traffic.
- On `miniscira_docker-control` to reach the middleware.
- **Not** on `miniscira_sandbox-egress`.
- Has no Docker socket or Portainer credential.
- Uses `/usr/local/bin/docker-wrapper` as Eve's Docker CLI.

### `docker-socket-proxy`

- On `miniscira_docker-control` only.
- Mounts `/data/docker.sock:/var/run/docker.sock`.
- Publishes no host port.
- Runs `/opt/data/miniscira-docker-api-proxy/proxy.py` from its locally built
  image.

### Eve sandbox containers

- Carry exact label `eve.sandbox=1`.
- Use only `miniscira_sandbox-egress`.
- The long-running base process is normally `sleep 2147483647`; this is expected.
- A running `bash ... cat > /workspace/main.py` plus `cat` for many seconds is
  **not** expected; it indicates a stuck file-upload stream.
- Session containers may persist stopped/running for reconnect semantics. Do not
  delete all labeled containers blindly while users have active turns.

### `sandbox-egress-proxy`

- On `miniscira_sandbox-egress` so sandboxes can reach it.
- On `miniscira_default` so it has upstream Internet routing.
- Publishes no host port.
- Squid CONNECT filtering uses requested hostnames; there is no TLS interception.

### `db`

- On `miniscira_default` only.
- Durable data is in the external production volume.
- Do not delete or recreate the DB volume during app or sandbox maintenance.

## 4. Authoritative files

### Application fork

Repository: `/opt/data/miniscira-src`

Important local files:

- `Dockerfile` — app image plus real Docker CLI and wrapper.
- `docker-compose.yml` — generic self-hosted stack and sandbox sidecars.
- `docker-compose.external-db.yml` — external Postgres override.
- `agent/sandbox.ts` — selects Eve's Docker backend.
- `agent/tools/run_code.ts` — writes and runs code in the Sandbox session.
- `lib/sandbox-config.ts` — image, proxy env, deny-all policy, `pullPolicy`.
- `scripts/eve-docker-wrapper.mjs` — forces Eve runs onto the sandbox network.
- `scripts/eve-docker-wrapper.test.mjs` — wrapper regression tests.
- `scripts/entrypoint.mjs`, `scripts/supervise.mjs` — Next/Eve lifecycle.
- `docs/DEPLOYMENT.md` — generic deployment runbook.
- `docs/UMBREL_SANDBOX_OPERATIONS.md` — this Umbrel-specific runbook.
- `AGENTS.md` — invariants for coding agents.

### Docker middleware

Directory: `/opt/data/miniscira-docker-api-proxy`

- `proxy.py` — authorization and native stream forwarding.
- `Dockerfile` — Python Alpine image, internal port 80.
- `default.conf.template` — historical nginx/Portainer-adapter artifact. It is
  **not** the active production implementation; do not accidentally rebuild from
  it.

### Egress proxy

Directory: `/opt/data/miniscira-sandbox-egress-proxy`

- `squid.conf` — host/port allowlist and default deny.
- `Dockerfile` — Alpine + Squid.

### Durable operational scripts

Directory: `/opt/data/scripts`

- `validate-miniscira-docker-sandbox.py` — destructive-to-scratch, non-destructive
  to Production acceptance test on port 8326. It creates and later removes a
  scratch Stack, scratch volumes, Template images, and Sandbox Containers.
- `deploy-miniscira-docker-sandbox-prod.py` — one-time Stack 30 deployment helper
  with automatic rollback. It contains rollout-specific string replacements and
  image tags; inspect/update it before reuse.
- `miniscira-build.py` — Portainer full-repository app-image builder. It writes
  only the canonical `miniscira:local` tag. Record the immutable image ID after
  each build and recreate the app service before verification.
- `miniscira-upstream-merge.sh` — scratch-branch upstream merge helper. Its
  hard-coded cherry-pick IDs in `--rebase` mode are historical; **merge mode is
  preferred**, and the script must be reviewed before reuse.
- `swap-miniscira-prod-final.py`, `verify-miniscira-prod-phase6.py` and older
  phase scripts are historical rollout tools. Do not assume their image tags or
  Compose contracts are current.

### Credentials

- `/opt/data/.env` contains Portainer and application secrets.
- Keep mode `0600`.
- Never print, commit, copy into docs, or put secret values in Git.
- Portainer Stack updates must preserve the existing Stack `Env` array. Sending
  `Env: []` can clear Production secrets.

## 5. Docker middleware policy

The middleware denies requests by default. It allows only the Docker operations that Eve needs.

### Allowed classes

- `GET`/`HEAD` Docker `_ping`.
- `GET` Docker `version` and `info`.
- Sandbox Container create, inspect, archive read/write, start, stop, wait, kill,
  `exec` creation, and delete.
- Attached Exec start and Exec inspect.
- Commit an owned Sandbox Container only into repository
  `eve-sandbox-template`.
- Inspect allowlisted base/Template images; delete Template images.
- Disconnect an owned Sandbox Container from the configured sandbox network.

### Container create rules

A request must:

- use exact label `eve.sandbox=1`;
- use the configured base image or an `eve-sandbox-template:*` image;
- use exactly the configured sandbox network;
- have no additional endpoint attachments.

It rejects:

- privileged mode;
- host PID/IPC/UTS/cgroup/user namespaces;
- Devices and DeviceRequests;
- bind mounts, mounts, volumes-from, tmpfs, and anonymous volumes;
- added Linux capabilities;
- host/exposed ports and `PublishAllPorts`;
- custom logging drivers;
- extra hosts, links, and custom DNS;
- custom cgroups, runtime, volume driver, or Container-ID file;
- sysctls;
- cleared protected proc paths;
- unsafe `SecurityOpt` values.

The middleware forces `no-new-privileges=true`.

### Root Exec rule

General root Exec is blocked. Eve's fixed base setup is allowed only when argv is
exactly:

```text
/bin/sh -c <fixed script>
```

The fixed script creates `/workspace` and verifies that Bash exists. If a future
Eve release changes this script, Template initialization will return `403` until
the constant and tests are intentionally updated.

### Ownership limit

Later lifecycle operations currently identify an owned resource by exact
`eve.sandbox=1`. The middleware adds `miniscira.middleware.owner=eve-sandbox-v1`
at creation, but Docker/Eve Template lifecycle did not preserve it at every
step, so it cannot be the sole runtime ownership key.

This is acceptable for this trusted personal deployment. Production services do not use `eve.sandbox=1`, and the middleware strictly checks container creation. This is not enough for mutually hostile tenants that share the middleware.

## 6. Required Docker stream behavior

Docker attached Exec and archive transfers send data in both directions. The proxy must forward client-to-Docker and Docker-to-client traffic at the same time.

Two regressions have occurred:

1. Portainer endpoint proxy returned `200`/`502` instead of `101 UPGRADED`.
2. The Python middleware waited only for Docker's response. Eve's file upload ran
   `cat > /workspace/main.py`; Docker waited for input while the client waited for
   completion. The UI appeared frozen.

The working implementation starts two async pipe tasks and uses
`asyncio.wait(..., FIRST_COMPLETED)`. When client upload ends, it sends EOF toward
Docker and waits for the Docker response. Do not simplify this to “wait for the
response task and cancel the request task.”

Required regression proof after **every middleware change**:

1. Build a fresh Sandbox Template.
2. Create a Session.
3. `writeTextFile({path: "main.py", content: "print(6*7)\n"})`.
4. Run `python3 main.py`.
5. Observe exit `0`, stdout `42`.
6. Inspect processes and confirm no lingering `cat` process.

A Python-only `spawn()` smoke test is not enough because it does not test file upload.

## 7. Egress policy

Current Squid allowlist includes:

- npm: `.npmjs.org`
- Python: `.pypi.org`, `.pythonhosted.org`
- Go: `.go.dev`, `.golang.org`, `storage.googleapis.com`
- Rust: `.crates.io`, `.rustup.rs`, `static.rust-lang.org`
- GitHub: `.github.com`, `.githubusercontent.com`, `.githubassets.com`
- Node: `.nodejs.org`
- Bun: `.bun.sh`
- Deno/JSR: `.deno.land`, `.jsr.io`
- GitLab: `.gitlab.com`

Ports are limited to HTTP `80` and HTTPS CONNECT `443`; everything else is denied.

When a legitimate package install fails:

1. Capture the exact hostname from package-manager output or temporarily enable
   a narrowly scoped Squid access log in scratch only.
2. Determine whether it is a stable official registry/CDN hostname.
3. Add the smallest domain rule possible.
4. Rebuild `miniscira-sandbox-egress-proxy:local`.
5. Run scratch acceptance proving the new host works and an unrelated host such
   as `example.com` remains denied.
6. Recreate only the egress-proxy service if no app changes are needed.

Do not allow IP literals, all of a cloud provider, `CONNECT` to arbitrary ports,
or the entire Internet merely to make one dependency install.

## 8. Build procedure

Hermes does not use a local Docker socket. Build local images through Portainer's Docker build API.

### Prerequisites

- `/opt/data/.env` has `PORTAINER_URL`, `PORTAINER_API_TOKEN`, and
  `PORTAINER_ENDPOINT_ID`.
- `/opt/data/bin/bun` exists; it is not necessarily on `PATH`.
- Working tree changes are understood and `git diff --check` is clean.
- No secret file is included in a build context.

### Build the app image

The app Dockerfile uses the entire repository. The build context must omit at
least `.git`, `.next`, `node_modules`, and temporary artifacts. Use a unique tag
for each candidate; do not overwrite the validated Production tag until scratch
passes.

Example naming:

```text
miniscira:selfhost-YYYYMMDD-N
```

Then inspect and record the resulting immutable image ID.

### Build the middleware image

```bash
python3 -m py_compile /opt/data/miniscira-docker-api-proxy/proxy.py
python3 /opt/data/skills/devops/portainer-automation/scripts/portainer_build_image.py \
  /opt/data/miniscira-docker-api-proxy \
  --tag miniscira-docker-api-proxy:local \
  --include Dockerfile --include proxy.py
```

After a mutable-tag rebuild, a Stack update is required to recreate the running
container. A healthy old container does not prove it uses the new image ID.

### Build the egress image

```bash
python3 /opt/data/skills/devops/portainer-automation/scripts/portainer_build_image.py \
  /opt/data/miniscira-sandbox-egress-proxy \
  --tag miniscira-sandbox-egress-proxy:local \
  --include Dockerfile --include squid.conf
```

## 9. Test and acceptance gates

### Run repository checks

From `/opt/data/miniscira-src`:

```bash
/opt/data/bin/bun run typecheck
/opt/data/bin/bun run lint
/opt/data/bin/bun test
git diff --check
python3 -m py_compile \
  /opt/data/miniscira-docker-api-proxy/proxy.py \
  /opt/data/scripts/validate-miniscira-docker-sandbox.py
```

Also run the focused wrapper test:

```bash
/opt/data/bin/bun test scripts/eve-docker-wrapper.test.mjs
```

### Test in scratch

```bash
MINISCIRA_VALIDATION_IMAGE=miniscira:<candidate-tag> \
  /opt/data/scripts/validate-miniscira-docker-sandbox.py
```

The expected last line is:

```text
RESULT: ALL PASS — artifacts /opt/data/artifacts/miniscira-docker-sandbox-<timestamp>
```

Acceptance must cover:

- all four services running;
- committed migration;
- `/api/health` and `/eve/v1/health` HTTP 200;
- Docker access through middleware;
- Volumes API 403;
- dangerous create and cross-resource probes 403;
- fresh Template lifecycle;
- file write plus Python execution returning 42;
- allowlisted PyPI works;
- unrelated `example.com` is denied;
- exact Sandbox label exists;
- Sandbox is attached only to `sandbox-egress`;
- middleware log has no `ERROR`, traceback, or pending-task destruction;
- scratch Stack, volumes, containers, Sessions, and Template images are cleaned.

The current validator's direct Eve test executes Python and egress checks. If it
is changed, preserve or add a `writeTextFile` regression so the UI-stall failure
cannot return unnoticed.

### Test in production

After deployment, verify all of the following:

1. `app`, `db`, `docker-socket-proxy`, and `sandbox-egress-proxy` are running and
   healthy with zero unexpected restarts.
2. Running image IDs match the candidate IDs.
3. `/api/health` and `/eve/v1/health` return 200.
4. A real Production Session can write `main.py`, run it, and return 42.
5. The Session has only `miniscira_sandbox-egress`.
6. Middleware has no new denial/error for the test.
7. Baseline users/chats/sessions and uploads remain present. Counts can naturally
   increase; they must not unexpectedly decrease.
8. No stuck `cat` process remains.

## 10. Portainer Stack update rules

- Production Stack ID is `30`.
- Always fetch and preserve the existing `Env` array.
- Only update through `/opt/data/bin/portainerctl` (`update-stack`), never a
  hand-rolled PUT. A raw request with the wrong route or body shape can write
  garbage into Portainer's on-disk stack env; from then on every update fails
  to parse that file before it can rewrite it, so the only fix is deleting and
  recreating the stack record. This happened on 2026-08-27 and cost a full
  outage plus manual container reconstruction.
- Back up the exact current `StackFileContent`, redacted Env names, running image
  IDs, volume names, and data counts before update.
- Use `PullImage: false` for locally built tags.
- Recreating the Stack services does not remove external named volumes.
- Do not publish middleware port 80, Squid port 3128, or Docker port 2375.
- Do not attach Sandboxes to `docker-control`.
- Do not attach the app or middleware to `sandbox-egress`.
- Do not mount `/data/docker.sock` into the app.
- The app container was rebuilt by hand on 2026-08-27 without Compose labels.
  The next Compose-managed deploy must `docker rm miniscira-app-1` first or
  creation fails with a name conflict.

To move the middleware or egress container to a newly built image ID, update the Stack even when the mutable image tag has not changed.

## 11. Backup and rollback

Known rollout backup:

```text
/opt/data/backups/miniscira-stack30-docker-sandbox-20260809-044154
```

A deployment backup should include:

- exact pre-update Compose;
- existing Stack Env names (never secret values in reports);
- app/DB/middleware/egress image IDs;
- DB and upload volume identities;
- logical DB backup for schema-changing upgrades;
- upload archive or verified volume snapshot for destructive storage changes;
- baseline data counts and endpoint status.

### Roll back code or images

If no migration changed schema:

1. Put the previous Compose and preserved Env array back into Stack 30.
2. Ensure previous local image IDs/tags still exist.
3. Wait for app and DB health.
4. Verify both health endpoints and data counts.

Image rollback does not delete data because the stack uses named volumes.

### Roll back a migration

If new migrations ran and are not backward compatible, code rollback alone is
unsafe. Restore the pre-upgrade database backup, then restore the previous
Compose/image.

### Limits of the automatic rollback helper

`deploy-miniscira-docker-sandbox-prod.py` automatically restores the prior
Compose on a failed rollout, but it is tied to specific old/new image strings and
Compose text. Treat it as a historical reference until reviewed for the current
version.

## 12. Routine service checks

### Run a fast health check

- Browser: `http://umbrel.local:8325`
- Hermes/container context:

```bash
python3 - <<'PY'
import urllib.request
for path in ('/api/health', '/eve/v1/health'):
    r = urllib.request.urlopen('http://10.21.0.1:8325' + path, timeout=20)
    print(path, r.status, r.read().decode())
PY
```

### Run production Eve evals

Use the durable runner from the repository root:

```bash
python3 scripts/run-production-evals.py
```

It connects the three parts of the production eval harness without printing
credentials:

1. It reads Stack 30 through Portainer and copies `EVE_EVAL_AUTH_TOKEN` only
   into the local Eve runner process.
2. It verifies that Stack 30 maps the token to `EVE_EVAL_USER_ID=miniscira-eval-user`.
   `agent/channels/eve.ts` turns a matching bearer token into that user principal.
3. It prepares the durable fixture chats for that account, starts
   `scripts/eval-forward.mjs`, and maps local `http://127.0.0.1:8325` to production
   `http://10.21.0.1:8325`. The loopback URL satisfies Eve's remote URL check while
   the TCP forward still exercises the deployed app and agent.
4. It runs every discovered eval with `--strict --max-concurrency 1` when no eval
   IDs or tags are supplied.

Pass ordinary `eve eval` arguments after the script name to narrow a run. For
example:

```bash
python3 scripts/run-production-evals.py --tag thread-search
python3 scripts/run-production-evals.py document-generation-routing
python3 scripts/run-production-evals.py --list
```

The runner owns the forward lifecycle and terminates it after the eval command.
Never print, copy, commit, or persist the token outside Stack 30.

### Inspect services through Portainer

Prefer `/opt/data/bin/portainerctl` for inventory, or the Portainer API using
`X-API-Key`. Never print the token.

Check:

- service state, health, restart count, `Config.Image`, immutable image ID;
- attached networks;
- active `eve.sandbox=1` containers;
- middleware and app logs;
- Docker Engine disk usage before pruning.

### Read Sandbox process state

Normal idle Session:

```text
/bin/sh -c sleep 2147483647
sleep 2147483647
```

Normal transient work may show Python, shell, package managers, or `cat` briefly.
A `cat > /workspace/main.py` that persists while UI remains busy indicates upload
stream deadlock.

## 13. Troubleshooting matrix

| Symptom | Evidence to collect | Likely cause / action |
| --- | --- | --- |
| UI turn stuck while app/Eve health is 200 | Active Sandbox `top`, app logs, middleware logs | If `cat > /workspace/main.py` persists, inspect bidirectional stream forwarding. Remove only the affected stuck Session after fixing/redeploying middleware; refresh/retry UI. |
| `unable to upgrade to tcp, received 403` | App log plus middleware `DENY` line | Middleware authorization rejected Container/Exec. Check exact Container labels, image, network, root setup argv, and `OWNED_EXECS`. Do not simply permit all Exec. |
| `unable to upgrade to tcp, received 200` or `502` | Path uses Portainer endpoint proxy | Wrong architecture/path for attached Exec. Production must use direct-socket middleware. |
| Eve Template initialization fails after Eve upgrade | Middleware denial on root Exec | Upstream Eve changed fixed base setup script or CLI request shape. Diff Eve bindings, update constant narrowly, add tests, run scratch. |
| Sandbox Python works but Agent file tool hangs | `top` shows `cat`; spawn-only smoke passes | Request-direction EOF/deadlock. Run exact `writeTextFile` regression. |
| Sandbox cannot install a legitimate dependency | Package error/Squid log gives host | Add only verified registry/CDN hostname, rebuild Squid, scratch-test allow and deny paths. |
| Sandbox can reach an unlisted site | Inspect its networks and proxy env | It may have an unintended network or direct route. It must have only `sandbox-egress`; confirm network is internal and no extra endpoints. |
| Middleware healthy but changes have no effect | Running image ID differs from new build ID | Mutable tag rebuilt without container recreation. Update/recreate Stack service. |
| `Task was destroyed but it is pending` | Middleware logs | Stream task lifecycle bug or container stopped with active pipes. Reproduce in scratch; do not accept recurrent warnings after normal completed operations. |
| Container create gets 403 | Middleware `DENY` details | Check exact `eve.sandbox=1`, allowlisted image, `NetworkMode`, extra endpoints, mounts, ports, security fields. |
| App cannot connect to Docker | `docker version` in app, middleware health | Check `DOCKER_HOST`, `docker-control`, middleware service name, socket mount, and `/data/docker.sock`. |
| App healthy but old browser request never completes | Server logs show prior tool failure; affected Sandbox removed | The old streamed UI turn cannot always resume. Refresh and submit a new request after service repair. |

## 14. Upstream maintenance policy

Git remotes:

```text
origin   https://github.com/thesobercoder/miniscira.git
upstream https://github.com/zaidmukaddam/miniscira.git
```

At documentation time:

```text
local HEAD:    a865fdb607207749afe6a0bcbd4711e722e2655b
upstream/main: 07a01c39eda4750d2237e6baa4a92c6d983f3fab
merge base:    0f53a750fbf7aa78b7d4d451e89ecc71955aba6e
local/upstream divergence: 25 local-only commits, 2 upstream-only commits
```

These values become stale. Always fetch the remotes and calculate them again.

### Never sync upstream directly on production `main`

1. Make the working tree clean. Commit the Sandbox implementation/docs first or
   save an explicit patch bundle.
2. Record HEAD, upstream commit, merge base, image IDs, and a Production backup.
3. Create a backup tag/branch.
4. Create a disposable branch such as `accept-upstream-YYYYMMDD`.
5. Merge `upstream/main` there. Prefer merge over rebasing this long-lived fork,
   because the merge commit preserves ancestry and local patch context.
6. Resolve conflicts according to ownership policy below.
7. Run repository checks.
8. Build a uniquely tagged candidate image.
9. Run complete scratch acceptance on port 8326.
10. Review app/Eve/Middleware/Squid changes and Docker API request-shape changes.
11. Back up Production, deploy candidate, run Production acceptance.
12. Only then merge/fast-forward the accepted branch into local `main` and push
    `origin`.

### Resolve conflicts by ownership

Local/fork implementation generally wins for:

- `Dockerfile` and deployment build glue;
- `docker-compose*.yml`;
- `.env.example` self-host settings;
- `agent/sandbox.ts` and `agent/tools/run_code.ts` where needed for Docker Eve;
- `lib/sandbox-config.ts`;
- `scripts/eve-docker-wrapper*`;
- committed migration/deployment behavior already used by Production;
- self-host docs and this runbook;
- mandatory `AI_GATEWAY_BASE_URL`, gateway catalog authority, finite
  `AI_MODELS_JSON` validation, and existing model defaults;
- `/opt/data/miniscira-docker-api-proxy` and
  `/opt/data/miniscira-sandbox-egress-proxy`.

Upstream usually wins for untouched generic UI/features/tests.

Manual semantic merge is required when upstream changes:

- Eve version or `eve/sandbox/docker` bindings;
- Sandbox Session APIs (`writeTextFile`, `writeFiles`, `spawn`, `run`, shutdown);
- Docker image/base runtime requirements;
- `scripts/entrypoint.mjs` or `scripts/supervise.mjs`;
- Next.js build/runtime structure;
- database schema/migrations;
- model/gateway code;
- uploads/file handling;
- package-manager versions or Bun lockfile.

Do not resolve those files with blanket `--ours` or `--theirs`.

### Check an upstream Eve upgrade

Before accepting a new `eve` version, inspect the installed/dist bindings for:

- Docker Container create payload;
- label names and roles;
- Template repository/tag format;
- root base-setup command;
- attached Exec headers/upgrade behavior;
- archive upload/download request shape;
- Network connect/disconnect calls;
- stop/delete/session persistence behavior.

Then update middleware policy only as narrowly as required and run adversarial
probes again.

### Use these Git commands

```bash
cd /opt/data/miniscira-src
git fetch upstream --tags
git fetch origin --tags
git status --short
git rev-parse HEAD
git rev-parse upstream/main
git merge-base HEAD upstream/main
git rev-list --left-right --count HEAD...upstream/main

git branch backup/pre-upstream-$(date +%Y%m%d-%H%M%S)
git switch -c accept-upstream-$(date +%Y%m%d) HEAD
git merge upstream/main --no-ff
```

If branch creation/switch fails, stop immediately. Confirm the branch name before
merging.

## 15. Patch development workflow

For any Sandbox patch:

1. Reproduce the exact failure in Production read-only logs/state or in scratch.
2. Add the narrowest focused regression test possible.
3. Patch one layer: app integration, wrapper, middleware, or Squid.
4. Run syntax/unit/type checks.
5. Build a unique candidate image ID.
6. Run fresh scratch acceptance. Remove cached Template image when lifecycle
   behavior must be proven.
7. Inspect logs and running process/network state, not only exit codes.
8. Obtain an independent review for changes to middleware authorization or
   network policy.
9. Back up and deploy Production.
10. Run exact user-path proof (`writeTextFile` + execution for code-tool issues).
11. Document the root cause, invariant, image ID, and rollback point.

Do not accept a patch only because `/api/health` returns 200. Next and Eve health checks prove that the services are ready. They do not test Sandbox file transfer, Engine policy, egress, or UI completion.

## 16. Cleanup and retention

- Scratch validator should clean its Stack, DB/upload volumes, Template images,
  Containers, and Sessions. Verify cleanup after failed/aborted runs.
- Do not remove Production Session Containers merely because they are idle or
  unhealthy without correlating them to a failed/stale user turn.
- Remove known smoke-test Containers/Template images by unique test prefix only.
- Never prune volumes as part of image cleanup.
- Keep the previous known-good app, middleware, and egress image IDs until the new
  version has passed Production acceptance and a rollback window.
- Keep recent `/opt/data/artifacts/miniscira-docker-sandbox-*` evidence and
  `/opt/data/backups/miniscira-stack30-*` backups under an intentional retention
  policy; do not blanket-delete them.

## 17. Known caveats and residual risks

- The middleware has the host Docker socket. A middleware bug can affect the
  Umbrel Docker Engine. Keep it private and default deny.
- `eve.sandbox=1` is the lifecycle ownership key. This is suitable for the trusted
  personal deployment, not hostile tenants.
- Squid hostname filtering is practical package egress control, not a complete
  malware-analysis firewall.
- Resource limits are not currently a documented enforced contract. A runaway
  Sandbox can consume Umbrel CPU/RAM/disk. Add and test limits if this becomes a
  problem.
- Local tags are mutable. Always compare immutable image IDs.
- Middleware `OWNED_EXECS` is in-memory and resets when the middleware restarts;
  Exec inspect provides the normal fallback while metadata exists.
- The root setup command is coupled to Eve internals and can break on dependency
  upgrades.
- Linux ARM64 is not natively supported by `@firecrawl/pdf-inspector`; this build
  targets `linux/amd64`, using emulation on ARM hosts.

## 18. Definition of "working"

The Sandbox is working only when all of these are true:

- Agent can create/reuse a Template.
- Agent can create a Session Container.
- Agent can upload a file into `/workspace` without hanging.
- Agent can execute code and stream output.
- Expected packages import/install through allowed egress.
- Unlisted destinations are denied.
- Sandbox is attached only to `sandbox-egress`.
- Production Containers/volumes/networks are denied by middleware policy.
- UI reaches a final answer/idle state instead of remaining busy.
- App, Eve, DB, middleware, and Squid remain healthy.
- Data and uploads remain intact.

If any item fails, the Sandbox has not passed acceptance.
