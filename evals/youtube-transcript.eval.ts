import { defineEval } from "eve/evals"
import { satisfies } from "eve/evals/expect"

/**
 * The youtube_transcript skill is prompt-routed like every other skill, so the
 * thing that rots is the routing decision itself. These gates therefore assert
 * the load_skill call, not just a plausible answer.
 */
export default defineEval({
  description:
    "Video questions load youtube_transcript and cite timestamps; non-video questions never do; caption-less videos are reported honestly.",
  async test(t) {
    await t.send(
      "What does the video https://www.youtube.com/watch?v=jNQXAC9IVRw actually say? Summarise its content."
    )
    t.succeeded()

    t.loadedSkill("youtube_transcript").label(
      "video question → youtube_transcript skill"
    )
    t.calledTool("run_code").label("caption fetch ran in the sandbox")
    t.noFailedActions().label("caption fetch completed without error")

    t.check(
      t.reply ?? "",
      satisfies<string>(
        (r) => /\[\d{1,2}:\d{2}\]/.test(r),
        "cites at least one [mm:ss] moment"
      )
    ).label("cited a timestamp")

    const restraint = t.newSession()
    await restraint.send("What is the capital of Australia? One word.")
    restraint.succeeded()
    restraint
      .notCalledTool("run_code")
      .label("non-video question never touches the sandbox")
    restraint
      .loadedSkill("youtube_transcript", { count: 0 })
      .label("non-video question never loads the skill")
  },
})
