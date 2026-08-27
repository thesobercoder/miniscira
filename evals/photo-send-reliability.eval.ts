import { existsSync } from "node:fs"
import { defineEval } from "eve/evals"
import { includes } from "eve/evals/expect"

const PHOTO = "/tmp/miniscira-vision-photo.jpg"

export default defineEval({
  description:
    "A 4032x3024 photo sent like a mobile camera capture is seen by the model; its embedded code comes back and no UTF-8 decode error appears.",
  timeoutMs: 8 * 60_000,
  async test(t) {
    if (!existsSync(PHOTO)) {
      t.skip(`fixture photo missing: ${PHOTO}`)
    }
    const turn = await t.sendFile(
      "A photo is attached. Reply with the exact code printed in the image and its dominant color.",
      PHOTO,
      "image/jpeg"
    )
    turn.expectOk()
    const reply = (t.reply ?? "").toLowerCase()
    t.check(reply, includes("7391"))
    t.check(reply, includes("red"))
    const serialized = JSON.stringify(turn.events).toLowerCase()
    t.check(serialized, includes("miniscira"))
  },
})
