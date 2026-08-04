import { NextResponse } from "next/server"

import { authed } from "@/lib/api-auth"
import { getUserSettings, upsertUserSettings } from "@/lib/user-settings"

export const GET = authed(async (_request, { userId }) =>
  NextResponse.json({ settings: await getUserSettings(userId) })
)

export const PATCH = authed(async (request, { userId }) => {
  const body = (await request.json().catch(() => ({}))) as {
    nickname?: string | null
    instructions?: string | null
    tone?: string
  }
  const settings = await upsertUserSettings(userId, {
    nickname: body.nickname,
    instructions: body.instructions,
    tone: body.tone,
  })
  return NextResponse.json({ settings })
})
