import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { authed } from "@/lib/api-auth"
import { db } from "@/lib/db"
import { userSettings } from "@/lib/db/schema"
import { verifyGatewayKey } from "@/lib/gateway-credentials"
import { seal } from "@/lib/secret-box"

/**
 * The user's own AI Gateway key.
 *
 * Write-only by design: the plaintext goes in and never comes back, not even to
 * the person who set it. `GET` answers with whether one is saved and its last
 * four characters, which is enough for the UI to say *which* key is in use
 * without the key itself ever being re-exposed to a browser, a proxy log, or a
 * screen recording.
 */

const MAX_KEY_LENGTH = 512

/** Whether a key is saved, and a hint at which one. */
export const GET = authed(async (_request, { userId }) => {
  const [row] = await db
    .select({
      cipher: userSettings.gatewayKeyCipher,
      last4: userSettings.gatewayKeyLast4,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1)
  return NextResponse.json({
    saved: Boolean(row?.cipher),
    last4: row?.last4 ?? null,
  })
})

/** Save a key, after checking the gateway actually accepts it. */
export const PUT = authed(async (request, { userId }) => {
  const body = (await request.json().catch(() => ({}))) as { apiKey?: unknown }
  const apiKey =
    typeof body.apiKey === "string" ? body.apiKey.trim() : undefined

  if (!apiKey || apiKey.length > MAX_KEY_LENGTH)
    return NextResponse.json(
      { error: "Paste your AI Gateway API key." },
      { status: 400 }
    )

  // Checked before it is stored, so a typo is caught here rather than surfacing
  // as a failed turn after the user has already typed a question.
  const verdict = await verifyGatewayKey(apiKey)
  if (!verdict.ok)
    return NextResponse.json({ error: verdict.reason }, { status: 400 })

  const values = {
    gatewayKeyCipher: seal(apiKey),
    gatewayKeyLast4: apiKey.slice(-4),
    updatedAt: new Date(),
  }
  await db
    .insert(userSettings)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: userSettings.userId, set: values })

  return NextResponse.json({ saved: true, last4: values.gatewayKeyLast4 })
})

/** Remove the saved key. */
export const DELETE = authed(async (_request, { userId }) => {
  await db
    .update(userSettings)
    .set({
      gatewayKeyCipher: null,
      gatewayKeyLast4: null,
      updatedAt: new Date(),
    })
    .where(eq(userSettings.userId, userId))
  return NextResponse.json({ saved: false, last4: null })
})
