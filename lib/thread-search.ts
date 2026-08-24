import { sql } from "drizzle-orm"

import { db } from "@/lib/db"

export const AGENT_THREAD_SEARCH_LIMIT = 8
export const PICKER_THREAD_SEARCH_LIMIT = 20

const MAX_QUERY_LENGTH = 200
const MAX_DATE_RANGE_MS = 366 * 24 * 60 * 60 * 1000

export type ThreadSearchDateRange = {
  from: string
  to: string
}

type ValidatedThreadSearchDateRange = {
  from: Date
  to: Date
}

export type ThreadSearchResult = {
  id: string
  title: string
  projectId: string | null
  updatedAt: string
  match: "exact" | "prefix" | "full_text" | "typo" | "recent"
  score: number
}

type Row = {
  id: string
  title: string
  project_id: string | null
  updated_at: Date | string
  match: ThreadSearchResult["match"]
  score: number | string
}

export type ThreadSearchInput = {
  userId: string
  query?: string
  dateRange?: ThreadSearchDateRange
  currentChatId?: string | null
  projectId?: string | null
  limit?: number
}

export function normalizeThreadQuery(query: string | undefined) {
  return (query ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
}

export function clampThreadSearchLimit(
  limit: number | undefined,
  maximum: number
) {
  if (!Number.isFinite(limit)) return maximum
  return Math.max(1, Math.min(maximum, Math.trunc(limit ?? maximum)))
}

export function validateThreadSearchDateRange(
  range: ThreadSearchDateRange | undefined
): ValidatedThreadSearchDateRange | null {
  if (!range) return null
  const from = new Date(range.from)
  const to = new Date(range.to)
  if (
    !/^\d{4}-\d{2}-\d{2}T/.test(range.from) ||
    !/^\d{4}-\d{2}-\d{2}T/.test(range.to) ||
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    from >= to ||
    to.getTime() - from.getTime() > MAX_DATE_RANGE_MS
  )
    throw new Error("Invalid thread search date range.")
  return { from, to }
}

export function threadSearchQuery({
  userId,
  query,
  dateRange,
  currentChatId,
  projectId,
  limit,
}: {
  userId: string
  query?: string
  dateRange: ValidatedThreadSearchDateRange | null
  currentChatId: string | null
  projectId: string | null
  limit: number
}) {
  const normalized = normalizeThreadQuery(query)
  const lower = normalized.toLocaleLowerCase()
  const useTrigram = normalized.length >= 3
  const from = dateRange?.from ?? null
  const to = dateRange?.to ?? null

  if (!normalized) {
    return sql`
      select id, title, project_id, updated_at,
             'recent'::text as match, 0::double precision as score
      from chat
      where user_id = ${userId}
        and (${currentChatId}::uuid is null or id <> ${currentChatId}::uuid)
        and (${projectId}::uuid is null or project_id = ${projectId}::uuid)
        and (${from}::timestamptz is null or updated_at >= ${from}::timestamptz)
        and (${to}::timestamptz is null or updated_at < ${to}::timestamptz)
      order by updated_at desc, id asc
      limit ${limit}
    `
  }

  return sql`
    with ranked as (
      select id, title, project_id, updated_at,
        case
          when lower(title) = ${lower} then 'exact'
          when lower(title) like ${`${lower}%`} then 'prefix'
          when title_search @@ plainto_tsquery('simple', ${normalized}) then 'full_text'
          else 'typo'
        end::text as match,
        case
          when lower(title) = ${lower} then 4::double precision
          when lower(title) like ${`${lower}%`} then 3::double precision
          when title_search @@ plainto_tsquery('simple', ${normalized})
            then 2 + ts_rank_cd(title_search, plainto_tsquery('simple', ${normalized}), 32)
          else similarity(lower(title), ${lower})
        end::double precision as score
      from chat
      where user_id = ${userId}
        and (${currentChatId}::uuid is null or id <> ${currentChatId}::uuid)
        and (${projectId}::uuid is null or project_id = ${projectId}::uuid)
        and (${from}::timestamptz is null or updated_at >= ${from}::timestamptz)
        and (${to}::timestamptz is null or updated_at < ${to}::timestamptz)
        and (
          lower(title) = ${lower}
          or lower(title) like ${`${lower}%`}
          or title_search @@ plainto_tsquery('simple', ${normalized})
          or (${useTrigram} and lower(title) % ${lower})
        )
    )
    select id, title, project_id, updated_at, match, score
    from ranked
    order by score desc, updated_at desc, id asc
    limit ${limit}
  `
}

export async function searchPreviousThreads({
  userId,
  query,
  dateRange,
  currentChatId = null,
  projectId = null,
  limit = AGENT_THREAD_SEARCH_LIMIT,
}: ThreadSearchInput): Promise<ThreadSearchResult[]> {
  const result = await db.execute(
    threadSearchQuery({
      userId,
      query,
      dateRange: validateThreadSearchDateRange(dateRange),
      currentChatId,
      projectId,
      limit,
    })
  )
  const rows = (Array.isArray(result) ? result : result.rows) as Row[]
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    projectId: row.project_id,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : new Date(row.updated_at).toISOString(),
    match: row.match,
    score: Number(row.score),
  }))
}

export async function activeThreadScope(rootSessionId: string, userId: string) {
  const result = await db.execute(sql`
    select id, project_id
    from chat
    where eve_session_id = ${rootSessionId} and user_id = ${userId}
    limit 2
  `)
  const rows = (Array.isArray(result) ? result : result.rows) as {
    id: string
    project_id: string | null
  }[]
  return rows.length === 1
    ? { currentChatId: rows[0].id, projectId: rows[0].project_id }
    : null
}

export async function ownedThreadScope(chatId: string | null, userId: string) {
  if (!chatId) return null
  const result = await db.execute(sql`
    select id, project_id
    from chat
    where id = ${chatId}::uuid and user_id = ${userId}
    limit 1
  `)
  const rows = (Array.isArray(result) ? result : result.rows) as {
    id: string
    project_id: string | null
  }[]
  return rows[0]
    ? { currentChatId: rows[0].id, projectId: rows[0].project_id }
    : null
}

export async function ownedThreadId(chatId: string | null, userId: string) {
  return (await ownedThreadScope(chatId, userId))?.currentChatId ?? null
}
