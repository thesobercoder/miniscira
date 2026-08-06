import { sql } from "drizzle-orm"
import { NextResponse } from "next/server"

import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

/**
 * Readiness/liveness endpoint for orchestration (docker-compose healthcheck,
 * Portainer, K8s probes). Returns 200 only when the app is serving AND the
 * database answers; 503 otherwise.
 */
export async function GET() {
  try {
    await db.execute(sql`SELECT 1`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    // Log server-side (message only — never the connection string) so
    // operators get a diagnostic; the public body stays generic.
    console.error("[health] database unreachable:", (err as Error).message)
    return NextResponse.json(
      { ok: false, error: "database unreachable" },
      { status: 503 }
    )
  }
}
