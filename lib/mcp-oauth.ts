import { randomBytes } from "node:crypto"

import {
  auth,
  type OAuthClientInformation,
  type OAuthClientMetadata,
  type OAuthClientProvider,
  type OAuthTokens,
} from "@ai-sdk/mcp"
import { eq } from "drizzle-orm"
import { appBaseUrl } from "@/lib/base-url"
import { db } from "@/lib/db"
import { type McpServer, mcpServer } from "@/lib/db/schema"
import {
  openMcpJson,
  openMcpSecret,
  sealMcpJson,
  sealMcpSecret,
} from "@/lib/mcp-secrets"

/**
 * OAuth 2.0 for protected MCP servers, per the MCP authorization spec:
 * discovery → dynamic client registration → PKCE authorization-code flow →
 * token persistence + refresh. Everything durable lives on the `mcp_server`
 * row (client info, tokens, transient PKCE verifier + CSRF state).
 *
 * The state parameter is `<serverId>.<random>` so the shared callback route
 * can find the row the flow belongs to.
 */

function oauthRedirectUrl() {
  return `${appBaseUrl()}/api/mcp/oauth/callback`
}

export class DbOAuthProvider implements OAuthClientProvider {
  /** Set when the SDK asks us to redirect — the start route returns it to the browser. */
  authorizationUrl: URL | null = null

  constructor(private row: McpServer) {}

  get redirectUrl(): string {
    return oauthRedirectUrl()
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "MiniScira",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none", // public client + PKCE
    }
  }

  private async persist(patch: Partial<typeof mcpServer.$inferInsert>) {
    await db.update(mcpServer).set(patch).where(eq(mcpServer.id, this.row.id))
    Object.assign(this.row, patch)
  }

  clientInformation(): OAuthClientInformation | undefined {
    const client = openMcpJson<OAuthClientInformation>(this.row.oauthClient)
    if (this.row.oauthClient && !client)
      throw new Error(
        "Stored OAuth client cannot be decrypted. Save the OAuth client again."
      )
    return client ?? undefined
  }

  async saveClientInformation(info: OAuthClientInformation): Promise<void> {
    await this.persist({ oauthClient: sealMcpJson(info) })
  }

  tokens(): OAuthTokens | undefined {
    const tokens = openMcpJson<OAuthTokens>(this.row.oauthTokens)
    if (this.row.oauthTokens && !tokens)
      throw new Error(
        "Stored OAuth tokens cannot be decrypted. Reconnect this server."
      )
    return tokens ?? undefined
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.persist({ oauthTokens: sealMcpJson(tokens) })
  }

  async codeVerifier(): Promise<string> {
    if (!this.row.oauthVerifier)
      throw new Error(
        "No PKCE code verifier stored — restart the connect flow."
      )
    const verifier = openMcpSecret(this.row.oauthVerifier)
    if (!verifier)
      throw new Error(
        "Stored PKCE code verifier cannot be opened — restart the connect flow."
      )
    return verifier
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await this.persist({ oauthVerifier: sealMcpSecret(codeVerifier) })
  }

  async state(): Promise<string> {
    const value = `${this.row.id}.${randomBytes(16).toString("hex")}`
    await this.persist({ oauthState: sealMcpSecret(value) })
    return value
  }

  async saveState(state: string): Promise<void> {
    await this.persist({ oauthState: sealMcpSecret(state) })
  }

  storedState(): string | undefined {
    return openMcpSecret(this.row.oauthState) ?? undefined
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    // Server-side: we can't navigate the browser — capture the URL and let the
    // API route hand it back so the client can redirect itself.
    this.authorizationUrl = authorizationUrl
  }

  async validateAuthorizationServerURL(
    _serverUrl: string | URL,
    authServerUrl: string | URL
  ): Promise<void> {
    const url = new URL(String(authServerUrl))
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1"
    if (url.protocol !== "https:" && !isLocal) {
      throw new Error(`Refusing non-https authorization server: ${url.origin}`)
    }
  }

  async invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier"
  ): Promise<void> {
    if (scope === "all") {
      await this.persist({
        oauthClient: null,
        oauthTokens: null,
        oauthVerifier: null,
        oauthState: null,
      })
    } else if (scope === "client") {
      await this.persist({ oauthClient: null })
    } else if (scope === "tokens") {
      await this.persist({ oauthTokens: null })
    } else {
      await this.persist({ oauthVerifier: null })
    }
  }
}

/** Kick off (or silently complete) the OAuth flow for a server. */
export async function startOAuth(
  row: McpServer
): Promise<{ status: "authorized" } | { status: "redirect"; url: string }> {
  const provider = new DbOAuthProvider(row)
  const result = await auth(provider, { serverUrl: row.url })
  if (result === "AUTHORIZED") return { status: "authorized" }
  if (!provider.authorizationUrl)
    throw new Error("Authorization redirect expected but no URL was produced.")
  return { status: "redirect", url: provider.authorizationUrl.toString() }
}

/** Complete the flow with the authorization code from the callback. */
export async function finishOAuth(
  row: McpServer,
  code: string,
  callbackState?: string
): Promise<void> {
  const provider = new DbOAuthProvider(row)
  const result = await auth(provider, {
    serverUrl: row.url,
    authorizationCode: code,
    callbackState,
  })
  if (result !== "AUTHORIZED")
    throw new Error("Token exchange did not complete.")
  // Transient flow material is spent.
  await db
    .update(mcpServer)
    .set({ oauthVerifier: null, oauthState: null })
    .where(eq(mcpServer.id, row.id))
}

/** Parse the server id back out of the state parameter. */
export function serverIdFromState(state: string): string | null {
  const id = state.split(".")[0]
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null
}
