import { expect, test } from "bun:test"
import { spawn } from "node:child_process"

const SUPERVISE = "scripts/supervise.mjs"
const ROOT = new URL("..", import.meta.url).pathname

interface RunResult {
  code: number | null
  signal: string | null
  stdout: string
}

interface RunOptions {
  graceMs?: number
  timeoutMs?: number
  env?: Record<string, string>
  signalAfterMs?: number
}

function runSupervise(
  cmds: string[][],
  opts: RunOptions = {}
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const args = [SUPERVISE]
    for (const c of cmds) args.push("--cmd", JSON.stringify(c))
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      env: {
        ...process.env,
        SUPERVISE_GRACE_MS: String(opts.graceMs ?? 10_000),
        ...opts.env,
      },
    })
    let stdout = ""
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()))
    child.stderr.on("data", (d: Buffer) => (stdout += d.toString()))
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      reject(new Error(`supervise timeout; stdout:\n${stdout}`))
    }, opts.timeoutMs ?? 30_000)
    if (opts.signalAfterMs) {
      setTimeout(() => {
        try {
          child.kill("SIGTERM")
        } catch {
          /* already exited */
        }
      }, opts.signalAfterMs)
    }
    child.on("close", (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal, stdout })
    })
  })
}

const LONG_LIVED = ["node", "-e", "setInterval(() => {}, 1000)"]
const SIGTERM_HANDLER = [
  "node",
  "-e",
  "process.on('SIGTERM', () => { console.log('GOT_SIGTERM'); process.exit(0) }); setInterval(() => {}, 1000)",
]
const SIGTERM_IGNORE = [
  "node",
  "-e",
  "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)",
]

test("usage: rejects when no --cmd is given", async () => {
  const r = await runSupervise([])
  expect(r.code).toBe(2)
  expect(r.stdout).toContain("usage")
})

test("usage: rejects invalid --cmd JSON", async () => {
  const child = spawn(process.execPath, [SUPERVISE, "--cmd", "not-json"], {
    cwd: ROOT,
  })
  const out = await new Promise<string>((resolve) => {
    let s = ""
    child.stdout.on("data", (d: Buffer) => (s += d.toString()))
    child.stderr.on("data", (d: Buffer) => (s += d.toString()))
    child.on("exit", () => resolve(s))
  })
  expect(out).toContain("invalid --cmd JSON")
})

test("usage: rejects --cmd that is not an argv array", async () => {
  const child = spawn(process.execPath, [SUPERVISE, "--cmd", '"node"'], {
    cwd: ROOT,
  })
  const out = await new Promise<string>((resolve) => {
    let s = ""
    child.stdout.on("data", (d: Buffer) => (s += d.toString()))
    child.stderr.on("data", (d: Buffer) => (s += d.toString()))
    child.on("exit", () => resolve(s))
  })
  expect(out).toContain("argv array")
})

test("propagates the first child's exit code", async () => {
  const r = await runSupervise([
    ["node", "-e", "console.log('A_UP'); process.exit(3)"],
    LONG_LIVED,
  ])
  expect(r.code).toBe(3)
  expect(r.stdout).toContain("A_UP")
  expect(r.stdout).toContain("terminating survivor")
})

test("first-exit wins even if it is a signal (SIGKILL => 137)", async () => {
  const r = await runSupervise([
    ["node", "-e", "process.kill(process.pid, 'SIGKILL')"],
    LONG_LIVED,
  ])
  expect(r.code).toBe(137)
})

test("terminates the survivor with SIGTERM when the first child exits", async () => {
  const r = await runSupervise([
    ["node", "-e", "process.exit(0)"],
    SIGTERM_HANDLER,
  ])
  expect(r.stdout).toContain("GOT_SIGTERM")
  expect(r.code).toBe(0)
})

test("waits for the survivor's graceful shutdown (regression: shutdown race)", async () => {
  const r = await runSupervise([
    ["node", "-e", "process.exit(3)"],
    [
      "node",
      "-e",
      "process.on('SIGTERM', () => { setTimeout(() => { console.log('B_DONE'); process.exit(0) }, 800) }); setInterval(() => {}, 1000)",
    ],
  ])
  expect(r.stdout).toContain("B_DONE")
  expect(r.code).toBe(3)
})

test("SIGKILLs a survivor that ignores SIGTERM after the grace period", async () => {
  const r = await runSupervise(
    [["node", "-e", "process.exit(3)"], SIGTERM_IGNORE],
    { graceMs: 500, timeoutMs: 15_000 }
  )
  expect(r.stdout).toContain("still alive after grace; sending SIGKILL")
  expect(r.code).toBe(3)
})

test("forwards the supervisor's SIGTERM to the children (exit 143)", async () => {
  const r = await runSupervise([SIGTERM_HANDLER, SIGTERM_HANDLER], {
    signalAfterMs: 700,
    timeoutMs: 15_000,
  })
  expect(r.stdout).toContain("GOT_SIGTERM")
  expect(r.code).toBe(143)
  expect(r.stdout).toContain("received SIGTERM")
})

test("forwarded signal reaches the whole group, not just the direct child", async () => {
  // The first child spawns a grandchild that shares its process group (this is
  // how eve's forked nitro server behaves). The supervisor must SIGTERM the
  // group so the grandchild also shuts down.
  const withGrandchild = [
    "node",
    "-e",
    "const { spawn } = require('node:child_process'); const g = spawn(process.execPath, ['-e', \"process.on('SIGTERM', () => { console.log('GRANDCHILD_SIGTERM'); process.exit(0) }); setInterval(() => {}, 1000)\"], { stdio: 'inherit' }); g.unref(); setInterval(() => {}, 1000)",
  ]
  const r = await runSupervise([withGrandchild, LONG_LIVED], {
    signalAfterMs: 700,
    timeoutMs: 15_000,
  })
  expect(r.stdout).toContain("GRANDCHILD_SIGTERM")
  expect(r.code).toBe(143)
})
