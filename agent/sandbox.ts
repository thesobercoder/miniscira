import { defineSandbox } from "eve/sandbox"
import { docker } from "eve/sandbox/docker"

// The sandbox backs the `run_code` tool: an offline Python environment for
// calculations and data analysis.
//
// Self-hosted: run sandboxes as Docker containers on the host daemon (the
// container mounts /var/run/docker.sock; eve shells out to the docker CLI).
// python:3.12-slim carries python3 + pip. bootstrap installs the analysis stack
// once with egress open and the result is committed into a reusable template
// image; onSession then denies network so user-run code can't reach out.
export default defineSandbox({
  backend: docker({
    image: "python:3.12-slim",
  }),
  async bootstrap({ use: openSandbox }) {
    const sandbox = await openSandbox()
    // Preinstall the common analysis libraries so run_code works offline. `|| true`
    // keeps a base image that already ships them (or lacks pip) from failing setup.
    await sandbox.run({
      command:
        "python3 -m pip install --quiet --no-input pandas numpy matplotlib || true",
    })
  },
  async onSession({ use: openSandbox }) {
    const sandbox = await openSandbox()
    // run_code needs no network; lock egress so user code can't call out.
    await sandbox.setNetworkPolicy("deny-all")
  },
})
