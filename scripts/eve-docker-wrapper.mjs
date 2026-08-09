#!/usr/bin/env node
import { spawn } from "node:child_process"

const REAL_DOCKER =
  process.env.EVE_REAL_DOCKER_PATH || "/usr/local/bin/docker-real"

export function rewriteDockerArgs(args, env = process.env) {
  if (args[0] !== "run") return [...args]

  const hasEveLabel = args.some(
    (arg, index) =>
      arg === "--label" && args[index + 1]?.startsWith("eve.sandbox=")
  )
  const networkIndex = args.findIndex((arg, index) => {
    if (arg === "--network" && args[index + 1] === "none") return true
    return arg === "--network=none"
  })

  if (!hasEveLabel) {
    if (networkIndex >= 0) {
      throw new Error("Refusing to rewrite a non-Eve docker run command")
    }
    return [...args]
  }

  const network = env.SANDBOX_DOCKER_NETWORK?.trim()
  if (!network) {
    throw new Error(
      "SANDBOX_DOCKER_NETWORK is required for allowlisted Docker sandbox egress"
    )
  }

  const rewritten = [...args]
  if (networkIndex < 0) {
    rewritten.splice(1, 0, "--network", network)
  } else if (rewritten[networkIndex] === "--network=none") {
    rewritten[networkIndex] = `--network=${network}`
  } else {
    rewritten[networkIndex + 1] = network
  }
  return rewritten
}

function logInvocation(original, rewritten) {
  const path = process.env.EVE_DOCKER_WRAPPER_LOG?.trim()
  if (!path) return
  const changed = original.join("\0") !== rewritten.join("\0")
  import("node:fs")
    .then(({ appendFileSync }) =>
      appendFileSync(
        path,
        `${new Date().toISOString()} changed=${changed} ${JSON.stringify(original)} => ${JSON.stringify(rewritten)}\n`
      )
    )
    .catch(() => {})
}

function forwardExit(child) {
  child.on("error", (error) => {
    console.error(
      `[eve-docker-wrapper] failed to launch Docker CLI: ${error.message}`
    )
    process.exit(127)
  })
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 1)
  })
}

async function main() {
  const original = process.argv.slice(2)
  let args
  try {
    args = rewriteDockerArgs(original)
    logInvocation(original, args)
  } catch (error) {
    console.error(`[eve-docker-wrapper] ${error.message}`)
    process.exit(64)
  }

  const child = spawn(REAL_DOCKER, args, {
    stdio: "inherit",
    env: process.env,
  })
  forwardExit(child)
}

if (import.meta.main) await main()
