import { defaultBackend, defineSandbox } from "eve/sandbox"
import {
  isDockerBackendConfigured,
  resolveDockerSandboxConfig,
} from "@/lib/sandbox-config"

// Docker when a daemon answers, the framework fallback otherwise. A pinned
// docker() backend kills `eve start` on hosts without Docker (Railway):
// production prewarm throws and the container crash-loops. defaultBackend()
// lets boot succeed there; `run_code` still reports code execution as
// unavailable when no Docker backend exists.
export default defineSandbox({
  backend: defaultBackend({ docker: resolveDockerSandboxConfig() }),
  async bootstrap({ use: openSandbox }) {
    if (!isDockerBackendConfigured()) return
    const sandbox = await openSandbox()
    await sandbox.run({
      command:
        "python3 --version && python3 -c 'import pandas, numpy, matplotlib'",
    })
  },
})
