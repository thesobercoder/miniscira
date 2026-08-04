import { defineSandbox } from "eve/sandbox"
import { justbash } from "just-bash"

// The sandbox backs the `run_code` tool: an offline Python environment for
// calculations and data analysis.
//
// This host (umbrelOS) does not expose the Docker daemon socket to app
// containers, so eve's container backends cannot run here. just-bash is eve's
// official local backend: sandbox commands run as plain bash subprocesses of
// this container. There is no container isolation and no live network-policy
// enforcement (just-bash accepts network config only at creation and eve
// throws on setNetworkPolicy for it) — sessions therefore run with this
// container's own network access. Acceptable for a private LAN deployment
// where the app container itself is trusted; revisit if this ever serves
// untrusted users.
//
// The analysis stack (pandas, numpy, matplotlib) is baked into the image at
// build time (see Dockerfile), so no egress is needed at bootstrap.
export default defineSandbox({
  backend: justbash(),
  async bootstrap({ use: openSandbox }) {
    const sandbox = await openSandbox()
    await sandbox.run({
      command: "python3 --version && pip --version || true",
    })
  },
})
