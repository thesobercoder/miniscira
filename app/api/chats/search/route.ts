import { NextResponse } from "next/server"
import { z } from "zod"

import { authed } from "@/lib/api-auth"
import {
  clampThreadSearchLimit,
  ownedThreadId,
  PICKER_THREAD_SEARCH_LIMIT,
  searchPreviousThreads,
} from "@/lib/thread-search"

const paramsSchema = z.object({
  q: z.string().max(200).default(""),
  currentChatId: z.string().uuid().optional(),
  limit: z.coerce.number().int().optional(),
})

export const GET = authed(async (request, { userId }) => {
  const parsed = paramsSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  )
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid search parameters" },
      { status: 400 }
    )

  const currentChatId = await ownedThreadId(
    parsed.data.currentChatId ?? null,
    userId
  )
  const results = await searchPreviousThreads({
    userId,
    query: parsed.data.q,
    currentChatId,
    projectId: null,
    limit: clampThreadSearchLimit(
      parsed.data.limit,
      PICKER_THREAD_SEARCH_LIMIT
    ),
  })
  return NextResponse.json({ results })
})
