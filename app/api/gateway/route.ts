import { NextResponse } from "next/server"

import { authed } from "@/lib/api-auth"
import { hasGatewayCredential } from "@/lib/gateway-credentials"

/**
 * GET /api/gateway — can this user actually run a turn?
 *
 * The alternative is letting them find out by sending a message and watching it
 * fail, which is the worst moment to learn you need to connect an account.
 */
export const GET = authed(async (_request, { userId }) => {
  return NextResponse.json({ connected: await hasGatewayCredential(userId) })
})
