import { defineTool } from "eve/tools"
import { z } from "zod"

import { describeMcpError, enabledServersFor, listServerTools } from "@/lib/mcp"

// The model sees this tool as `mcp_list_tools`, from the filename.
export default defineTool({
  description:
    "List the tools available on the user's connected MCP servers (remote tool servers they added in Settings). Call this first to discover what a server offers — each entry has the server name, tool names, descriptions, and input JSON schemas. Then invoke a tool with mcp_call.",
  inputSchema: z.object({
    server: z
      .string()
      .optional()
      .describe(
        "Only list tools from this server (by name). Omit to list every connected server."
      ),
  }),
  async execute({ server }, ctx) {
    const userId = ctx.session.auth.current?.principalId
    if (!userId || ctx.session.auth.current?.principalType !== "user") {
      return {
        error: "No authenticated user — cannot access MCP servers.",
        servers: [],
      }
    }

    let servers = await enabledServersFor(userId)
    if (server) {
      servers = servers.filter(
        (s) => s.name.toLowerCase() === server.toLowerCase()
      )
      if (servers.length === 0) {
        return {
          error: `No connected MCP server named "${server}".`,
          servers: [],
        }
      }
    }
    if (servers.length === 0) {
      return { servers: [], note: "The user has no MCP servers connected." }
    }

    const results = await Promise.all(
      servers.map(async (s) => {
        try {
          const tools = await listServerTools(s)
          return { server: s.name, tools }
        } catch (err) {
          return { server: s.name, tools: [], error: describeMcpError(err) }
        }
      })
    )
    return { servers: results }
  },
})
