# Agent instructions

## Rules

- Read this `AGENTS.md` file before you start each job.
- Keep this file at 200 lines or fewer.
- Use this file as the table of contents for repository instructions.
- Read each linked document that applies to the job before you act.
- Put durable detailed guidance in `docs/`, not in this file.
- Add or update a linked document when a recurring rule, invariant, or workflow appears.
- Keep the product experience simple. Make search, memory, tools, and routing automatic when possible.
- Do not expose secrets in code, logs, diffs, tests, documentation, or replies.
- Do not implement a backlog idea before its PRD has explicit user approval and its TODO, test, and eval plan exists.
- Exercise the real affected flow and verify the result. Health checks alone are not proof.

## Documents

| Document | Read when |
|---|---|
| [Development principles](docs/DEVELOPMENT_PRINCIPLES.md) | Before you change code, tests, repository structure, framework code, or source-control state. |
| [Product planning and execution](docs/PRODUCT_PLANNING.md) | Before you add a backlog idea, write or approve a PRD, create TODOs, or implement planned product work. |
| [Product backlog](docs/PRODUCT_IDEAS.md) | When you capture, review, prioritize, or promote product ideas. |
| [Engineering invariants](docs/ENGINEERING_INVARIANTS.md) | Before you change auth, Eve events, Lookouts, models, streams, attachments, global styles, or motion. |
| [Deployment guide](docs/DEPLOYMENT.md) | Before generic self-hosting, configuration, migration, backup, restore, health, or proxy work. |
| [Umbrel Sandbox operations](docs/UMBREL_SANDBOX_OPERATIONS.md) | Before any Soham-specific Umbrel, Portainer, Docker Sandbox, middleware, network, egress, image, or production deployment work. |
| [Fork foundations plan](docs/plans/2026-08-22-fork-foundations.md) | When you need the historical rationale and implementation record for the independent fork foundations. |
| [README](README.md) | When you need the product overview, architecture, local setup, or public project guidance. |

## Document maintenance

- Keep each detailed rule in one canonical document.
- Update this table when you add, rename, move, or remove an instruction document.
- Use link descriptions as routing rules. Make them specific enough that an agent knows when to read the document.
- Split a document when unrelated guidance makes it difficult to load only the context needed for one job.
