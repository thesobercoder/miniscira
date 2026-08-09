import { defineSandbox } from "eve/sandbox"
import { docker } from "eve/sandbox/docker"
import { resolveDockerSandboxConfig } from "@/lib/sandbox-config"

// run_code executes in a sibling Docker container through the private
// docker-socket-proxy service. MiniScira never receives the host socket itself.
// The sandbox image is prebuilt. Eve still requests deny-all; the deployment's
// Docker CLI wrapper replaces that isolated network with the internal
// sandbox-egress network and injects an HTTP(S) proxy. Squid then permits only
// package registries and source hosts documented by the deployment.
export default defineSandbox({
  backend: docker(resolveDockerSandboxConfig()),
  async bootstrap({ use: openSandbox }) {
    const sandbox = await openSandbox()
    await sandbox.run({
      command:
        "python3 --version && python3 -c 'import pandas, numpy, matplotlib'",
    })
  },
})
