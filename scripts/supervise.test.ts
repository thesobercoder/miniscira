import { describe, expect, test } from "bun:test"
import { spawn } from "node:child_process"
import path from "node:path"

const SCRIPTS = path.join(import.meta.dir, "..", "scripts")
const SUPERVISE = path.join(SCRIPTS, "supervise.mjs")
const ENTRYPOINT = path.join(SCRIPTS, "entrypoint.mjs")

function run(args: string[], env: Record<string, string> = {}) {
  return new Promise<{ code: number | null; signal: NodeJS.Signals | null; out: string }>((resolve) => {
    const child = spawn(process.execPath, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    })
    let out = ""
    child.stdout.on("data", (d: Buffer) => (out += d))
    child.stderr.on("data", (d: Buffer) => (out += d))
    child.once("exit", (code, signal) => resolve({ code, signal, out }))
  })
}

describe("supervise", () => {
  test("exits with the first child's code and terminates the survivor", async () => {
    const { code, out } = await run([
      SUPERVISE,
      "--cmd",
      "node -e \"console.log('A_UP');process.exit(3)\"",
      "--cmd",
      "node -e \"process.on('SIGTERM',()=>{console.log('B_GOT_TERM');process.exit(0)});setInterval(()=>{},1000)\"",
    ])
    expect(code).toBe(3)
    expect(out).toContain("A_UP")
    expect(out).toContain("B_GOT_TERM")
  }, 15_000)

  test("exits with 128+signal when the first child is killed by a signal", async () => {
    const { code, out } = await run([
      SUPERVISE,
      "--cmd",
      "node -e \"process.kill(process.pid,'SIGKILL')\"",
      "--cmd",
      "node -e \"setInterval(()=>{},1000)\"",
    ])
    expect(code).toBe(137) // 128 + 9
    expect(out).toContain("terminating survivor(s)")
  }, 15_000)

  test("forwards SIGTERM to children and exits 143", async () => {
    const child = spawn(
      process.execPath,
      [
        SUPERVISE,
        "--cmd",
        "node -e \"process.on('SIGTERM',()=>{console.log('C_GOT_TERM');process.exit(0)});setInterval(()=>{},1000)\"",
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    )
    let out = ""
    child.stdout.on("data", (d) => (out += d))
    await new Promise((resolve) => setTimeout(resolve, 600))
    child.kill("SIGTERM")
    const code = await new Promise((resolve) =>
      child.once("exit", (exitCode) => resolve(exitCode))
    )
    expect(code).toBe(143) // 128 + 15
    expect(out).toContain("C_GOT_TERM")
  }, 15_000)

  test("waits for the survivor's graceful shutdown before exiting", async () => {
    const { code, out } = await run([
      SUPERVISE,
      "--cmd",
      "node -e \"process.exit(3)\"",
      "--cmd",
      "node -e \"process.on('SIGTERM',()=>{setTimeout(()=>{console.log('B_SHUTDOWN_DONE');process.exit(0)},800)});setInterval(()=>{},1000)\"",
    ])
    expect(code).toBe(3)
    expect(out).toContain("B_SHUTDOWN_DONE")
  }, 15_000)

  test("usage error without --cmd", async () => {
    const { code } = await run([SUPERVISE])
    expect(code).toBe(2)
  })
})

describe("entrypoint", () => {
  test("refuses to start without DATABASE_URL", async () => {
    const { code, out } = await run([ENTRYPOINT], { DATABASE_URL: "" })
    expect(code).toBe(1)
    expect(out).toContain("DATABASE_URL")
  })

  test("fails clearly when the database is unreachable", async () => {
    const { code, out } = await run(
      [ENTRYPOINT],
      {
        DATABASE_URL: "postgresql://nobody:nope@127.0.0.1:59999/nope",
        DB_WAIT_TIMEOUT_MS: "3000",
      }
    )
    expect(code).toBe(1)
    expect(out).toContain("database not reachable")
  }, 20_000)
})
