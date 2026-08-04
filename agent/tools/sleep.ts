import { sleep } from "eve/tools/sleep"

// eve's opt-in durable sleep (added in 0.29). The pause parks the turn's
// workflow rather than holding a timer in the application runtime, so it
// survives restarts and costs nothing while waiting.
//
// The point here is polling work the agent can't rush: a Lookout checking
// whether a story developed, or re-reading a status page that was mid-deploy.
// Without it the model's only options are to spin on repeated fetches or give
// up and answer from a stale read.
export default sleep()
