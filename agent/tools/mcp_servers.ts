import { defineDynamic, defineTool } from "eve/tools"

import {
  callServerTool,
  describeMcpError,
  enabledServersFor,
  listServerToolsCached,
} from "@/lib/mcp"

// The user's enabled MCP servers, surfaced as real named, typed tools
// (`<server>__<tool>` with the server's own JSON schema) instead of the
// mcp_list_tools/mcp_call two-step. Resolved on turn.started so toggling a
// source in the composer applies on the very next message; the per-server
// tool list is cached for 5 minutes, so steady state costs one DB query.
function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/\W+/g, "_")
      .replace(/^_+|_+$/g, "") || "server"
  )
}

export default defineDynamic({
  events: {
    "turn.started": async (_event, ctx) => {
      const auth = ctx.session.auth.current ?? ctx.session.auth.initiator
      if (auth?.principalType !== "user" || !auth.principalId) return null

      const servers = await enabledServersFor(auth.principalId)
      if (servers.length === 0) return null

      const tools: Record<string, ReturnType<typeof defineTool>> = {}
      await Promise.all(
        servers.map(async (server) => {
          // JSON-safe closure config: dynamic executors are reconstructed from
          // stored closure variables across step boundaries, so no Dates.
          const cfg = {
            id: server.id,
            userId: server.userId,
            name: server.name,
            url: server.url,
            transport: server.transport,
            headers: server.headers,
            enabled: server.enabled,
            oauthClient: server.oauthClient,
            oauthTokens: server.oauthTokens,
            oauthVerifier: server.oauthVerifier,
            oauthState: server.oauthState,
          }
          try {
            const list = await listServerToolsCached(server)
            for (const t of list) {
              tools[`${slug(server.name)}__${t.name}`] = defineTool({
                description: `[${server.name} MCP] ${t.description || t.name}`,
                inputSchema: (t.inputSchema ?? {
                  type: "object",
                }) as Parameters<typeof defineTool>[0]["inputSchema"],
                execute: async (input) => {
                  try {
                    return await callServerTool(
                      cfg,
                      t.name,
                      (input ?? {}) as Record<string, unknown>
                    )
                  } catch (err) {
                    return { error: describeMcpError(err) }
                  }
                },
              })
            }
          } catch (err) {
            // A dead server shouldn't cost the turn its other tools.
            console.error(
              `mcp dynamic tools: ${server.name} listing failed`,
              err
            )
          }
        })
      )
      return Object.keys(tools).length > 0 ? tools : null
    },
  },
})
