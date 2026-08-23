import { createCipheriv, createHash, randomBytes } from "node:crypto"

import { Pool } from "pg"

const url = process.env.DATABASE_URL
const secret = process.env.BETTER_AUTH_SECRET
if (!url || !secret) {
  console.error("DATABASE_URL and BETTER_AUTH_SECRET are required")
  process.exit(1)
}

const VERSION = "enc:v1"
const key = createHash("sha256")
  .update(`miniscira:mcp-credential:v1\0${secret}`)
  .digest()

function seal(value) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ])
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":")
}

function sealed(value) {
  return typeof value === "string" && value.startsWith(`${VERSION}:`)
}

const pool = new Pool({ connectionString: url, max: 1 })
try {
  const { rows } = await pool.query(
    `SELECT id, headers, oauth_client, oauth_tokens, oauth_verifier, oauth_state
       FROM mcp_server`
  )
  let migrated = 0
  for (const row of rows) {
    const headers = row.headers
      ? Object.fromEntries(
          Object.entries(row.headers).map(([name, value]) => [
            name,
            sealed(value) ? value : seal(value),
          ])
        )
      : null
    const oauthClient = row.oauth_client
      ? sealed(row.oauth_client.enc)
        ? row.oauth_client
        : { enc: seal(JSON.stringify(row.oauth_client)) }
      : null
    const oauthTokens = row.oauth_tokens
      ? sealed(row.oauth_tokens.enc)
        ? row.oauth_tokens
        : { enc: seal(JSON.stringify(row.oauth_tokens)) }
      : null
    const oauthVerifier = row.oauth_verifier
      ? sealed(row.oauth_verifier)
        ? row.oauth_verifier
        : seal(row.oauth_verifier)
      : null
    const oauthState = row.oauth_state
      ? sealed(row.oauth_state)
        ? row.oauth_state
        : seal(row.oauth_state)
      : null

    const changed =
      JSON.stringify(headers) !== JSON.stringify(row.headers) ||
      JSON.stringify(oauthClient) !== JSON.stringify(row.oauth_client) ||
      JSON.stringify(oauthTokens) !== JSON.stringify(row.oauth_tokens) ||
      oauthVerifier !== row.oauth_verifier ||
      oauthState !== row.oauth_state
    if (!changed) continue
    await pool.query(
      `UPDATE mcp_server
          SET headers = $2, oauth_client = $3, oauth_tokens = $4,
              oauth_verifier = $5, oauth_state = $6, updated_at = now()
        WHERE id = $1`,
      [row.id, headers, oauthClient, oauthTokens, oauthVerifier, oauthState]
    )
    migrated += 1
  }
  console.log(`Migrated ${migrated} MCP credential row(s).`)
} finally {
  await pool.end()
}
