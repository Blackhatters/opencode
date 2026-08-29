import { describe, expect, test } from "bun:test"
import { SessionID } from "@opencode-ai/schema/session-id"
import { wakeInput } from "../../src/swarm/watchdog"

describe("SwarmWatchdog.wakeInput", () => {
  test("preserves the session agent so a wake cannot rewrite it", () => {
    const sessionID = SessionID.make("ses_worker")
    const input = wakeInput({ id: sessionID, agent: "worker" }, "continue")
    expect(input).toEqual({
      sessionID,
      agent: "worker",
      parts: [{ type: "text", text: "continue", synthetic: true }],
    })
  })

  test("skips sessions with no agent", () => {
    expect(wakeInput({ id: SessionID.make("ses_none") }, "continue")).toBeUndefined()
  })
})
