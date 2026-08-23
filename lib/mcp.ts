import { createMCPClient, UnauthorizedError } from "@ai-sdk/mcp"
import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { type McpServer, mcpServer } from "@/lib/db/schema"
import { DbOAuthProvider, oauthAttemptIsActive } from "@/lib/mcp-oauth"
import { openMcpHeaders, openMcpJson } from "@/lib/mcp-secrets"

/**
 * Remote MCP servers only: HTTP (streamable) and SSE transports. No stdio.
 *
 * @public Domain type for the transport column; kept exported for callers that
 * need to name it even while the current ones infer it.
 */
export type McpTransport = "http" | "sse"

const CALL_TIMEOUT_MS = 60_000

type MCPClient = Awaited<ReturnType<typeof createMCPClient>>

// Full rows get an OAuth provider when the server has completed (or started)
// the auth flow; ad-hoc objects (tests) connect anonymously.
type ServerConfig = Pick<McpServer, "url" | "transport" | "headers"> &
  Partial<McpServer>

function isProtected(server: ServerConfig): server is McpServer {
  return (
    typeof server.id === "string" &&
    (server.oauthTokens != null || server.oauthClient != null)
  )
}

/** Rethrow MCP auth failures with a user-actionable message. */
export function describeMcpError(err: unknown): string {
  if (err instanceof UnauthorizedError) {
    return "Authorization required or expired. Reconnect this server on the MCP servers page."
  }
  return err instanceof Error ? err.message : "MCP request failed"
}

/**
 * Run `fn` against a fresh MCP client for the server and always close it.
 * Redirects stay rejected (SDK default) to keep SSRF out of user-added URLs.
 */
async function withMCPClient<T>(
  server: ServerConfig,
  fn: (client: MCPClient) => Promise<T>
): Promise<T> {
  const client = await createMCPClient({
    transport: {
      type: server.transport === "sse" ? "sse" : "http",
      url: server.url,
      headers: openMcpHeaders(server.headers) ?? undefined,
      authProvider: isProtected(server)
        ? new DbOAuthProvider(server)
        : undefined,
    },
    clientName: "miniscira",
  })
  try {
    return await fn(client)
  } finally {
    await client.close().catch(() => {})
  }
}

/**
 * Public row shape for API responses — the only shape an MCP row may leave the
 * server in. Any new route returning MCP data must go through this function.
 *
 * Withheld: `headers` values, `oauthTokens`, `oauthClient`, `oauthVerifier`,
 * `oauthState`, `userId`. Exposed instead: header *names* and a boolean
 * `authorized`.
 */
export function publicServer(row: McpServer) {
  const oauthClient = openMcpJson<{ client_id?: unknown }>(row.oauthClient)
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    transport: row.transport,
    // Header *names* only — values are credentials (e.g. Authorization) and
    // must never leave the server. The UI only needs to know which exist.
    headerNames: row.headers ? Object.keys(row.headers) : [],
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    authorized: row.oauthTokens != null,
    hasOAuthClient: row.oauthClient != null,
    oauthClientId:
      typeof oauthClient?.client_id === "string" ? oauthClient.client_id : null,
    oauthCallbackMode:
      row.oauthCallbackMode === "manual"
        ? ("manual" as const)
        : ("automatic" as const),
    oauthCallbackUrl: row.oauthCallbackUrl,
    oauthPending:
      row.oauthCallbackMode === "manual" &&
      row.oauthAttemptCallbackUrl != null &&
      oauthAttemptIsActive(row.oauthAttemptStartedAt),
    offersOAuth:
      row.authType === "oauth" ||
      row.oauthClient != null ||
      row.oauthTokens != null,
  }
}

export type McpToolInfo = {
  name: string
  description: string
  inputSchema: unknown
}

// Short-lived per-server tool list cache: the dynamic tool resolver re-runs
// every turn, and a listTools round-trip per server per turn would be wasteful.
const toolListCache = new Map<string, { at: number; tools: McpToolInfo[] }>()
const TOOL_LIST_TTL_MS = 5 * 60 * 1000

/** listServerTools with a 5-minute in-memory cache, keyed per server. */
export async function listServerToolsCached(
  server: McpServer
): Promise<McpToolInfo[]> {
  const key = `${server.id}:${server.url}`
  const hit = toolListCache.get(key)
  if (hit && Date.now() - hit.at < TOOL_LIST_TTL_MS) return hit.tools
  const tools = await listServerTools(server)
  toolListCache.set(key, { at: Date.now(), tools })
  return tools
}

/** List the tools a server exposes (name, description, JSON schema). */
export async function listServerTools(
  server: ServerConfig
): Promise<McpToolInfo[]> {
  return withMCPClient(server, async (client) => {
    const tools = await client.tools()
    return Object.entries(tools).map(([name, tool]) => {
      const t = tool as {
        description?: string
        inputSchema?: { jsonSchema?: unknown }
      }
      return {
        name,
        description: t.description ?? "",
        inputSchema: t.inputSchema?.jsonSchema ?? t.inputSchema ?? {},
      }
    })
  })
}

/**
 * Call one tool on a server and return the MCP result content.
 *
 * Hardened against stalls: MCP resets the per-request timeout whenever the
 * server sends a progress notification, so a chatty-but-stuck server can hang
 * forever. maxTotalTimeout caps that, an AbortSignal kills the transport, and
 * a Promise.race guarantees the tool returns even if the SDK never settles.
 */
export async function callServerTool(
  server: ServerConfig,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  return withMCPClient(server, async (client) => {
    let raceTimer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        client.callTool({
          name: toolName,
          arguments: args,
          options: {
            timeout: CALL_TIMEOUT_MS,
            maxTotalTimeout: CALL_TIMEOUT_MS * 2,
            signal: AbortSignal.timeout(CALL_TIMEOUT_MS * 2 + 5_000),
          },
        }),
        new Promise<never>((_, reject) => {
          raceTimer = setTimeout(
            () =>
              reject(
                new Error(
                  `MCP tool "${toolName}" timed out after ${(CALL_TIMEOUT_MS * 2) / 1000}s`
                )
              ),
            CALL_TIMEOUT_MS * 2 + 10_000
          )
        }),
      ])
    } finally {
      clearTimeout(raceTimer)
    }
  })
}

/** The user's enabled MCP servers. */
export async function enabledServersFor(userId: string): Promise<McpServer[]> {
  return db
    .select()
    .from(mcpServer)
    .where(and(eq(mcpServer.userId, userId), eq(mcpServer.enabled, true)))
}

/** Find one enabled server by (case-insensitive) name for the user. */
export async function findServer(
  userId: string,
  name: string
): Promise<McpServer | null> {
  const servers = await enabledServersFor(userId)
  return (
    servers.find((s) => s.name.toLowerCase() === name.toLowerCase()) ?? null
  )
}
