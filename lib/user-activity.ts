import "server-only"

import { sql } from "drizzle-orm"

import { db } from "@/lib/db"

export type DayCount = { date: string; count: number }

export type Activity = {
  /** One entry per day for the last 53 weeks, oldest first, gaps filled with 0. */
  days: DayCount[]
  totalMessages: number
  totalChats: number
  activeDays: number
  currentStreak: number
  busiestDay: DayCount | null
}

const WEEKS = 53
const SPAN_DAYS = WEEKS * 7

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * A GitHub-style contribution history of the user's messages: one bucket per day
 * (user `message.received` events on their chats), plus headline totals. All
 * dates are UTC to keep the grid stable.
 */
export async function getUserActivity(userId: string): Promise<Activity> {
  const perDayRes = await db.execute(sql`
    select to_char(date_trunc('day', ce.created_at), 'YYYY-MM-DD') as day, count(*)::int as n
    from chat_event ce
    join chat c on c.id = ce.chat_id
    where c.user_id = ${userId}
      and ce.event->>'type' = 'message.received'
      and ce.created_at >= now() - interval '53 weeks'
    group by 1
  `)
  const totalsRes = await db.execute(sql`
    select
      (select count(*)::int from chat where user_id = ${userId}) as chats,
      (select count(*)::int from chat_event ce join chat c on c.id = ce.chat_id
         where c.user_id = ${userId} and ce.event->>'type' = 'message.received') as messages
  `)

  const perDayRows = (
    Array.isArray(perDayRes) ? perDayRes : perDayRes.rows
  ) as {
    day: string
    n: number
  }[]
  const totalsRow = ((Array.isArray(totalsRes)
    ? totalsRes
    : totalsRes.rows)[0] ?? {
    chats: 0,
    messages: 0,
  }) as { chats: number; messages: number }

  const counts = new Map<string, number>()
  for (const r of perDayRows) counts.set(r.day, Number(r.n))

  // Build a contiguous day grid ending today so the heatmap has no holes.
  const days: DayCount[] = []
  const today = new Date()
  const start = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  )
  start.setUTCDate(start.getUTCDate() - (SPAN_DAYS - 1))
  let busiest: DayCount | null = null
  let activeDays = 0
  for (let i = 0; i < SPAN_DAYS; i++) {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    const key = ymd(d)
    const count = counts.get(key) ?? 0
    if (count > 0) activeDays++
    if (!busiest || count > busiest.count) busiest = { date: key, count }
    days.push({ date: key, count })
  }

  // Current streak: consecutive active days counting back from today (today with
  // no activity yet still allows the streak to hold if yesterday was active).
  let currentStreak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count > 0) currentStreak++
    else if (i === days.length - 1)
      continue // today not started yet — don't break
    else break
  }

  return {
    days,
    totalMessages: totalsRow.messages,
    totalChats: totalsRow.chats,
    activeDays,
    currentStreak,
    busiestDay: busiest && busiest.count > 0 ? busiest : null,
  }
}
