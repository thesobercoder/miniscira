#!/usr/bin/env node
/**
 * Two-process supervisor for the MiniScira runtime (eve + next).
 *
 * Spawns every command as a DIRECT child (argv array, no `sh -c` wrapper) in
 * its OWN process group (detached), with inherited stdio. Teardown semantics:
 *
 *   - when EITHER child exits, record its code/signal as the container result
 *   - SIGTERM the survivor's whole process group (reaches its children too,
 *     e.g. eve's forked nitro server) and wait for the DIRECT child's exit
 *     event — NOT for the group to empty: orphaned grandchildren (esbuild
 *     service, nitro) can keep a group alive forever, which would hang the
 *     container exit
 *   - after a grace period (SUPERVISE_GRACE_MS, default 10s) SIGKILL any
 *     survivor that has not exited
 *   - propagate SIGTERM/SIGINT/SIGHUP from the supervisor to the children
 *   - exit with the first child's code (128+signal if it died by signal, or
 *     128+signal if the supervisor itself was signaled)
 *
 * CLI (for tests/one-offs):
 *   node supervise.mjs --cmd '["node","-e","..."]' --cmd '["next","start"]'
 */
import { spawn } from "node:child_process"
import { pathToFileURL } from "node:url"

const GRACE_MS = Number(process.env.SUPERVISE_GRACE_MS ?? 10_000)

const SIGNAL_NUMBERS = {
  SIGHUP: 1,
  SIGINT: 2,
  SIGQUIT: 3,
  SIGILL: 4,
  SIGTRAP: 5,
  SIGABRT: 6,
  SIGBUS: 7,
  SIGFPE: 8,
  SIGKILL: 9,
  SIGUSR1: 10,
  SIGSEGV: 11,
  SIGUSR2: 12,
  SIGPIPE: 13,
  SIGALRM: 14,
  SIGTERM: 15,
  SIGCHLD: 17,
  SIGCONT: 18,
  SIGSTOP: 19,
  SIGTSTP: 20,
  SIGTTIN: 21,
  SIGTTOU: 22,
}

export function supervise(
  commands,
  { graceMs = GRACE_MS, log = console.log } = {}
) {
  return new Promise((resolve) => {
    const children = commands.map((argv, i) => {
      const child = spawn(argv[0], argv.slice(1), {
        stdio: "inherit",
        detached: true,
      })
      child._label = `child[${i}] (${argv[0]} ${argv.slice(1).join(" ").slice(0, 60)})`
      return child
    })

    let finished = false
    let shutdownStarted = false
    let firstCode = 0
    let firstSignal = null
    let parentSignal = null

    const finish = (code, signal) => {
      if (finished) return
      finished = true
      const sigNum = SIGNAL_NUMBERS[signal ?? ""]
      if (parentSignal) resolve(128 + (SIGNAL_NUMBERS[parentSignal] ?? 15))
      else if (signal) resolve(128 + (sigNum ?? 15))
      else resolve(code)
    }

    const killTree = (child, sig) => {
      try {
        process.kill(-child.pid, sig)
      } catch {
        /* group already gone */
      }
    }

    const allExited = () =>
      Promise.all(
        children.map((c) =>
          c.exitCode !== null || c.signalCode !== null
            ? Promise.resolve()
            : new Promise((r) => c.once("exit", r))
        )
      )

    const startTeardown = () => {
      if (shutdownStarted) return
      shutdownStarted = true
      for (const c of children) killTree(c, "SIGTERM")
      const killer = setTimeout(() => {
        for (const c of children) {
          if (c.exitCode === null && c.signalCode === null) {
            log(
              `[supervise] ${c._label} still alive after grace; sending SIGKILL`
            )
            killTree(c, "SIGKILL")
          }
        }
      }, graceMs)
      killer.unref?.()
      allExited().then(() => {
        clearTimeout(killer)
        finish(firstCode, firstSignal)
      })
    }

    for (const child of children) {
      child.once("exit", (code, signal) => {
        if (shutdownStarted) return
        firstCode = code ?? 1
        firstSignal = signal ?? null
        log(
          `[supervise] ${child._label} exited (code=${code}, signal=${signal}); terminating survivor(s)`
        )
        startTeardown()
      })
    }

    const onSignal = (sig) => {
      if (shutdownStarted) return
      parentSignal ??= sig
      log(`[supervise] received ${sig}; forwarding to children`)
      startTeardown()
    }
    process.on("SIGTERM", onSignal)
    process.on("SIGINT", onSignal)
    process.on("SIGHUP", onSignal)
  })
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  const commands = []
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === "--cmd") {
      try {
        commands.push(JSON.parse(process.argv[++i]))
      } catch (err) {
        console.error(`[supervise] invalid --cmd JSON: ${err.message}`)
        process.exit(2)
      }
    }
  }
  for (const argv of commands) {
    if (
      !Array.isArray(argv) ||
      argv.length === 0 ||
      typeof argv[0] !== "string"
    ) {
      console.error(
        '[supervise] each --cmd must be a JSON argv array, e.g. --cmd \'["node","-e","1"]\''
      )
      process.exit(2)
    }
  }
  if (commands.length === 0) {
    console.error(
      "[supervise] usage: node supervise.mjs --cmd '[json argv]' [--cmd ...]"
    )
    process.exit(2)
  }
  const code = await supervise(commands)
  process.exit(code)
}
