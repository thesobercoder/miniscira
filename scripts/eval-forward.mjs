#!/usr/bin/env node

import net from "node:net"

const listenHost = "127.0.0.1"
const listenPort = Number(process.env.MINISCIRA_EVAL_FORWARD_PORT ?? 8325)
const targetHost = process.env.MINISCIRA_EVAL_TARGET_HOST ?? "10.21.0.1"
const targetPort = Number(process.env.MINISCIRA_EVAL_TARGET_PORT ?? 8325)

const server = net.createServer((client) => {
  const upstream = net.createConnection({ host: targetHost, port: targetPort })
  client.pipe(upstream)
  upstream.pipe(client)
  const close = () => {
    client.destroy()
    upstream.destroy()
  }
  client.on("error", close)
  upstream.on("error", close)
})

server.listen(listenPort, listenHost, () => {
  console.log(`forward ready on http://${listenHost}:${listenPort}`)
})

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
