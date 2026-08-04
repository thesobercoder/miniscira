// No `server-only` guard here, unlike the other db modules: this one is also
// imported by agent/instructions/20-personalization.ts, and eve bundles authored
// modules outside React's `react-server` condition — where the guard's entry
// point throws by design. Client bundling is still prevented by the `db` import
// below, and the only consumers are the app layout, the settings route, and that
// instruction module.
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { userSettings } from "@/lib/db/schema"
import { normalizeTone, type UserSettings } from "@/lib/tones"

export type { UserSettings } from "@/lib/tones"

const DEFAULTS: UserSettings = {
  nickname: null,
  instructions: null,
  tone: "default",
}

/** The signed-in user's settings, falling back to defaults when none saved yet. */
export async function getUserSettings(userId: string): Promise<UserSettings> {
  const [row] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1)
  if (!row) return DEFAULTS
  return {
    nickname: row.nickname?.trim() || null,
    instructions: row.instructions?.trim() || null,
    tone: normalizeTone(row.tone),
  }
}

/** Insert or update the user's settings; unspecified fields are left untouched. */
export async function upsertUserSettings(
  userId: string,
  patch: Partial<{
    nickname: string | null
    instructions: string | null
    tone: string
  }>
): Promise<UserSettings> {
  const clean = {
    nickname:
      patch.nickname != null
        ? patch.nickname.trim().slice(0, 80) || null
        : undefined,
    instructions:
      patch.instructions != null
        ? patch.instructions.trim().slice(0, 4000) || null
        : undefined,
    tone: patch.tone != null ? normalizeTone(patch.tone) : undefined,
  }
  const set = {
    ...(clean.nickname !== undefined ? { nickname: clean.nickname } : {}),
    ...(clean.instructions !== undefined
      ? { instructions: clean.instructions }
      : {}),
    ...(clean.tone !== undefined ? { tone: clean.tone } : {}),
    updatedAt: new Date(),
  }
  await db
    .insert(userSettings)
    .values({
      userId,
      nickname: clean.nickname ?? null,
      instructions: clean.instructions ?? null,
      tone: clean.tone ?? "default",
    })
    .onConflictDoUpdate({ target: userSettings.userId, set })
  return getUserSettings(userId)
}
