import { defineSandbox } from "eve/sandbox"
import { vercel } from "eve/sandbox/vercel"

// The sandbox backs the `run_code` tool: an offline Python environment for
// calculations and data analysis. Pin it to Vercel Sandbox instead of the local
// microsandbox VM, which is heavy to install and slow to cold-start. On Vercel
// this is the native backend; from local dev it creates a hosted sandbox using
// your Vercel credentials (VERCEL_OIDC_TOKEN from `vercel link`, or VERCEL_TOKEN
// + team/project).
//
// bootstrap installs the analysis stack once, with egress open, and the snapshot
// is reused across sessions. onSession then denies network so user-run code can't
// reach out. The sandbox is created lazily on first use, so the web-research path
// (firecrawl/exa/x/reddit/researcher) never spins one up —
// only run_code does.
export default defineSandbox({
  backend: vercel(),
  // `use` is aliased to `openSandbox` — eslint's rules-of-hooks otherwise
  // mistakes eve's sandbox opener for React 19's `use` hook.
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
