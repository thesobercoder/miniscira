import { describe, expect, test } from "bun:test"

const migration = await Bun.file(
  new URL("./0004_scalable-research-history-unit-1.sql", import.meta.url)
).text()
const snapshot = await Bun.file(
  new URL("./meta/0004_snapshot.json", import.meta.url)
).json()
const repositoryRoot = new URL("../../../", import.meta.url)

const source = async (path: string) =>
  Bun.file(new URL(path, repositoryRoot)).text()

describe("scalable research history Unit 1 migration", () => {
  test("adds safe chat defaults and fixed-value constraints", () => {
    expect(migration).toContain(
      'ADD COLUMN "last_activity_at" timestamp DEFAULT now() NOT NULL'
    )
    expect(migration).toContain(
      'ADD COLUMN "archive_state_changed_at" timestamp DEFAULT now() NOT NULL'
    )
    expect(migration).toContain('SET "last_activity_at" = "updated_at"')
    expect(migration).toContain('"archive_state_changed_at" = "updated_at"')
    expect(migration).toContain("in ('manual', 'inactivity')")
    expect(migration).toContain("in ('scheduled', 'manual', 'retry')")
    expect(migration).toContain(
      "in ('claimed', 'running', 'succeeded', 'failed', 'cancelled')"
    )
  })

  test("backfills Lookout reports once without mutating existing relationships", () => {
    expect(migration).toContain('INSERT INTO "lookout_run"')
    expect(migration).toContain('c."id", c."user_id", l."name", l."prompt"')
    expect(migration).toContain(
      'CASE WHEN p."id" IS NULL THEN NULL ELSE c."project_id" END'
    )
    expect(migration).toContain(
      'CASE WHEN l."user_id" = c."user_id" THEN c."lookout_id" ELSE NULL END'
    )
    expect(migration).toContain('WHERE c."lookout_id" IS NOT NULL')
    expect(migration).toContain('ON CONFLICT ("report_chat_id") DO NOTHING')
    expect(migration).toContain(
      'c."created_at", c."created_at", c."created_at", c."updated_at"'
    )
    expect(migration).toContain("legacy Lookout report reconciliation failed")
    expect(migration).not.toContain('UPDATE "chat" SET "lookout_id"')
    expect(migration).not.toContain('UPDATE "chat_event"')
    expect(migration).not.toContain('UPDATE "document"')
    expect(migration).not.toContain('UPDATE "project"')
    expect(migration).not.toContain('"eve_session_id" =')
    expect(migration).not.toContain('"continuation_token" =')
    expect(migration).not.toContain('"stream_index" =')
  })

  test("commits the model, checks, foreign keys, and query indexes in metadata", () => {
    const chat = snapshot.tables["public.chat"]
    const lookoutRun = snapshot.tables["public.lookout_run"]
    expect(chat.columns.last_activity_at.default).toBe("now()")
    expect(chat.columns.archive_state_changed_at.default).toBe("now()")
    expect(chat.checkConstraints.chat_archive_reason_check).toBeDefined()
    expect(chat.indexes.chat_active_history_idx).toBeDefined()
    expect(chat.indexes.chat_archived_history_idx).toBeDefined()
    expect(chat.indexes.chat_active_project_history_idx).toBeDefined()
    expect(chat.indexes.chat_auto_archive_idx).toBeDefined()
    expect(
      lookoutRun.uniqueConstraints.lookout_run_report_chat_id_unique
    ).toBeDefined()
    for (const name of [
      "lookout_run_trigger_check",
      "lookout_run_status_check",
      "lookout_run_retry_check",
      "lookout_run_owner_provenance_check",
      "lookout_run_retry_trigger_check",
      "lookout_run_finished_check",
      "lookout_run_failure_code_check",
      "lookout_run_report_state_check",
      "lookout_run_lease_check",
      "lookout_run_email_check",
    ])
      expect(lookoutRun.checkConstraints[name]).toBeDefined()
    for (const name of [
      "lookout_run_lookout_owner_fk",
      "lookout_run_project_owner_fk",
      "lookout_run_retry_owner_fk",
      "lookout_run_report_chat_owner_fk",
    ]) {
      expect(lookoutRun.foreignKeys[name].onDelete).toBe("set null")
      expect(lookoutRun.foreignKeys[name].columnsFrom).toHaveLength(2)
      expect(lookoutRun.foreignKeys[name].columnsTo).toHaveLength(2)
    }
    expect(lookoutRun.indexes.lookout_run_history_idx).toBeDefined()
    expect(lookoutRun.indexes.lookout_run_latest_idx).toBeDefined()
  })

  test("keeps pre-Unit-1 writers compatible with database defaults", async () => {
    const [
      chatRoute,
      branchRoute,
      lookoutRoute,
      lookoutRunner,
      eventRoute,
      chatUpdateRoute,
      titleRoute,
    ] = await Promise.all([
      source("app/api/chats/route.ts"),
      source("app/api/chats/[id]/branch/route.ts"),
      source("app/api/lookouts/route.ts"),
      source("lib/lookout-runner.ts"),
      source("app/api/chats/[id]/events/route.ts"),
      source("app/api/chats/[id]/route.ts"),
      source("app/api/chats/[id]/title/route.ts"),
    ])

    for (const writer of [chatRoute, branchRoute, lookoutRunner]) {
      expect(writer).toContain(".insert(chat)")
      expect(writer).not.toContain("lastActivityAt:")
      expect(writer).not.toContain("archiveStateChangedAt:")
    }
    expect(eventRoute).toContain("insert into chat_event")
    expect(eventRoute).toMatch(/update chat\s+set updated_at = now\(\)/)
    expect(lookoutRoute).toContain(".insert(lookout)")
    expect(chatUpdateRoute).toContain("continuationToken")
    expect(chatUpdateRoute).toContain("streamIndex")
    expect(titleRoute).toContain(".set({ title, updatedAt: new Date() })")
    expect(branchRoute).toContain("events.map((e) =>")
  })
})
