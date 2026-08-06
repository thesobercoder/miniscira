#!/usr/bin/env node
/**
 * Two-process supervisor for the MiniScira runtime (eve + next).
 *
 * Spawns every command as a `sh -c` child in its OWN process group (detached),
 * with inherited stdio, then:
 *   - when EITHER command's shell exits, terminates the survivor's process
 *     GROUP with SIGTERM (SIGKILL after a grace period) and exits with the
 *     first child's exit code (or 128+signal when it was killed by a signal);
 *   - forwards SIGTERM/SIGINT/SIGHUP/SIGQUIT to every process group and exits
 *     with 128+signal once they are gone;
 *   - waits for the process GROUPS to actually empty before exiting — the
 *     shell wrapper may die instantly while the node process inside is still
 *     flushing a graceful shutdown, and the supervisor must not leave before
 *     it is done (and must never orphan a live runtime half).
 *
 * Standalone CLI:  node scripts/supervise.mjs --cmd "cmd A" --cmd "cmd B"
 * Library:         import { supervise } from "./supervise.mjs"
 *
 * Env: SUPERVISE_GRACE_MS (default 10000) — time to wait after the first
 * termination before SIGKILLing a stuck process group.
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
  SIGSTKFLT: 16,
  SIGCHLD: 17,
  SIGCONT: 18,
  SIGSTOP: 19,
  SIGTSTP: 20,
  SIGTTIN: 21,
  SIGTTOU: 22,
  SIGURG: 23,
  SIGXCPU: 24,
  SIGXFSZ: 25,
  SIGVTALRM: 26,
  SIGPROF: 27,
  SIGWINCH: 28,
  SIGIO: 29,
  SIGPWR: 30,
  SIGSYS: 31,
}

function groupAlive(child) {
  try {
    process.kill(-child.pid, 0)
    return true
  } catch {
    return false
  }
}

export function supervise(commands, { graceMs = GRACE_MS, log = console.log } = {}) {
  return new Promise((resolve) => {
    if (commands.length === 0) {
      log("[supervise] no commands to supervise")
      resolve(0)
      return
    }
    const children = commands.map((cmd, i) => {
      // detached: true gives each child its own process group so we can
      // signal the WHOLE tree (shell wrapper + node process). Without it,
      // a SIGTERM to `sh -c "node ..."` kills only the shell and orphans
      // the runtime process — the exact failure this supervisor exists to
      // prevent.
      const child = spawn("sh", ["-c", cmd], {
        stdio: "inherit",
        detached: true,
      })
      child._label = `child[${i}] (${cmd.slice(0, 60)}${cmd.length > 60 ? "…" : ""})`
      return child
    })

    let settled = false
    let teardownStarted = false
    let firstCode = 0
    let firstSignal = null
    let parentSignal = null

    const killTree = (child, sig) => {
      try {
        process.kill(-child.pid, sig)
      } catch {
        // Process group already gone (ESRCH) — nothing to do.
      }
    }

    const killAll = (sig) => {
      for (const c of children) {
        if (groupAlive(c)) killTree(c, sig)
      }
    }

    const finish = () => {
      if (settled) return
      settled = true
      if (parentSignal) {
        resolve(128 + (SIGNAL_NUMBERS[parentSignal] ?? 15))
      } else if (firstSignal) {
        resolve(128 + (SIGNAL_NUMBERS[firstSignal] ?? 15))
      } else {
        resolve(firstCode)
      }
    }

    const startTeardown = () => {
      if (teardownStarted) return
      teardownStarted = true
      killAll("SIGTERM")
      const deadline = Date.now() + graceMs
      const tick = () => {
        if (children.every((c) => !groupAlive(c))) {
          finish()
          return
        }
        if (Date.now() > deadline) {
          for (const c of children) {
            if (groupAlive(c)) {
              log(`[supervise] ${c._label} still alive after grace period; sending SIGKILL`)
              killTree(c, "SIGKILL")
            }
          }
        }
        setTimeout(tick, 200)
      }
      tick()
    }

    const onChildExit = (child, code, signal) => {
      // Only the FIRST child exit drives the teardown. Exits that follow
      // (the survivor's shell dying from our own signal) must not overwrite
      // the first child's status.
      if (teardownStarted) return
      firstCode = code ?? 1
      firstSignal = signal ?? null
      log(
        `[supervise] ${child._label} exited (code=${code}, signal=${signal}); ` +
          "terminating survivor(s)"
      )
      startTeardown()
    }

    for (const child of children) {
      child.once("exit", (code, signal) => onChildExit(child, code, signal))
    }

    const onSignal = (sig) => {
      if (teardownStarted) return
      parentSignal ??= sig
      log(`[supervise] received ${sig}; forwarding to children`)
      startTeardown()
    }
    process.on("SIGTERM", onSignal)
    process.on("SIGINT", onSignal)
    process.on("SIGHUP", onSignal)
    process.on("SIGQUIT", onSignal)
  })
}

async function main() {
  const commands = []
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === "--cmd" && process.argv[i + 1]) commands.push(process.argv[++i])
  }
  if (commands.length === 0) {
    console.error("usage: node scripts/supervise.mjs --cmd 'command A' --cmd 'command B'")
    process.exit(2)
  }
  const code = await supervise(commands)
  process.exit(code)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
