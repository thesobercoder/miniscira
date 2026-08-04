import { defineTool } from "eve/tools"
import { once } from "eve/tools/approval"
import { z } from "zod"

import { callServerTool, describeMcpError, findServer } from "@/lib/mcp"

// The model sees this tool as `mcp_call`, from the filename.
export default defineTool({
  description:
    "Invoke a tool on one of the user's connected MCP servers. Use mcp_list_tools first to see the available servers, tool names, and each tool's input schema; pass arguments matching that schema.",
  // User-added servers can expose side-effecting tools behind this generic
  // bridge, so the first call in a session asks the user; later calls flow.
  approval: once(),
  inputSchema: z.object({
    server: z
      .string()
      .min(1)
      .describe("The MCP server name (as shown by mcp_list_tools)."),
    tool: z.string().min(1).describe("The tool name on that server."),
    arguments: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Arguments for the tool, matching its input schema."),
  }),
  async execute({ server, tool, arguments: args }, ctx) {
    const userId = ctx.session.auth.current?.principalId
    if (!userId || ctx.session.auth.current?.principalType !== "user") {
      return { error: "No authenticated user — cannot access MCP servers." }
    }

    const row = await findServer(userId, server)
    if (!row) return { error: `No connected MCP server named "${server}".` }

    try {
      const result = await callServerTool(row, tool, args ?? {})
      return { server: row.name, tool, result }
    } catch (err) {
      return { server: row.name, tool, error: describeMcpError(err) }
    }
  },
})
