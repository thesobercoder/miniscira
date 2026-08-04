import { defineSchedule } from "eve/schedules"

import { runLookout } from "@/lib/lookout-runner"
import { claimDueLookouts, finishLookoutRun } from "@/lib/lookout-schedule"

// The only authored schedule: a minute tick that leases due lookout rows and
// runs each one in-process (eve's dynamic-scheduling pattern). Replaces the
// old QStash callback — no external queue, works on Vercel Cron and locally
// via `eve start` (or POST /eve/v1/dev/schedules/lookouts in dev).
export default defineSchedule({
  cron: "* * * * *",
  run({ waitUntil }) {
    waitUntil(
      (async () => {
        const due = await claimDueLookouts(new Date(), 10)
        await Promise.all(
          due.map(async (row) => {
            try {
              const result = await runLookout(row.id)
              await finishLookoutRun(row, { failed: !result.ok })
            } catch (err) {
              console.error(`lookout dispatch failed (${row.id})`, err)
              await finishLookoutRun(row, { failed: true }).catch(() => {})
            }
          })
        )
      })()
    )
  },
})
