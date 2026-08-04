import { and, eq, isNull, lte, or, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { type Lookout, lookout } from "@/lib/db/schema"

// Our UI only ever emits two UTC cron shapes (see lookouts-view cronFrom):
//   daily  → "M H * * *"
//   weekly → "M H * * D"
// so next-run math is a small fixed computation, not a cron engine.
export function nextRunFromCron(cron: string, after: Date): Date | null {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const minute = Number(parts[0])
  const hour = Number(parts[1])
  const dow = parts[4] === "*" ? null : Number(parts[4])
  if (!Number.isInteger(minute) || !Number.isInteger(hour)) return null
  if (dow !== null && !Number.isInteger(dow)) return null

  const next = new Date(after)
  next.setUTCHours(hour, minute, 0, 0)
  if (next <= after) next.setUTCDate(next.getUTCDate() + 1)
  if (dow !== null) {
    while (next.getUTCDay() !== ((dow % 7) + 7) % 7)
      next.setUTCDate(next.getUTCDate() + 1)
  }
  return next
}

/** The moment a lookout should first fire, from its stored shape. */
export function initialNextRunAt(
  row: Pick<Lookout, "frequency" | "cron" | "runAt">
): Date | null {
  if (row.frequency === "once") return row.runAt ?? null
  return row.cron ? nextRunFromCron(row.cron, new Date()) : null
}

const LEASE_MS = 10 * 60 * 1000

/**
 * Atomically lease due lookouts so overlapping minute ticks never double-run
 * one. A leased row is invisible to other ticks until the lease expires.
 */
export async function claimDueLookouts(
  now: Date,
  limit: number
): Promise<Lookout[]> {
  const due = await db
    .update(lookout)
    .set({ leasedUntil: new Date(now.getTime() + LEASE_MS) })
    .where(
      and(
        eq(lookout.status, "active"),
        lte(lookout.nextRunAt, now),
        or(isNull(lookout.leasedUntil), lte(lookout.leasedUntil, now)),
        sql`${lookout.id} in (select id from ${lookout} where status = 'active' and next_run_at <= ${now} and (leased_until is null or leased_until <= ${now}) limit ${limit})`
      )
    )
    .returning()
  return due
}

/** Lease one lookout for a manual run. Returns null if already leased. */
export async function leaseLookout(id: string, now: Date) {
  const [row] = await db
    .update(lookout)
    .set({ leasedUntil: new Date(now.getTime() + LEASE_MS) })
    .where(
      and(
        eq(lookout.id, id),
        or(isNull(lookout.leasedUntil), lte(lookout.leasedUntil, now))
      )
    )
    .returning()
  return row ?? null
}

/** Release a manual-run lease. Does not reschedule — a manual run must not
 *  move the user's next automatic run. */
export async function releaseLookoutLease(id: string) {
  await db
    .update(lookout)
    .set({ leasedUntil: null, updatedAt: new Date() })
    .where(eq(lookout.id, id))
}

/** After a run: advance recurring rows to their next slot and drop the lease. */
export async function finishLookoutRun(
  row: Lookout,
  opts?: { failed?: boolean }
) {
  const patch: Partial<typeof lookout.$inferInsert> = {
    leasedUntil: null,
    updatedAt: new Date(),
  }
  if (opts?.failed) {
    // Retry shortly instead of waiting a whole cycle (or dying silently).
    patch.nextRunAt = new Date(Date.now() + 5 * 60 * 1000)
  } else if (row.frequency === "once") {
    patch.nextRunAt = null
  } else if (row.cron) {
    patch.nextRunAt = nextRunFromCron(row.cron, new Date())
  }
  await db.update(lookout).set(patch).where(eq(lookout.id, row.id))
}
