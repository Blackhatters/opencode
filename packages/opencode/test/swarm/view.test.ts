import { describe, expect, test } from "bun:test"
import { Swarm } from "@opencode-ai/schema/swarm"
import { SessionID } from "@opencode-ai/schema/session-id"
import { SwarmView } from "@/swarm/view"

const swarmID = Swarm.ID.make("proj_swarm_view")
const from = SessionID.make("ses_from")
const to = SessionID.make("ses_to")

const snapshot: SwarmView.Snapshot = {
  swarmID,
  enabled: true,
  board: [
    Swarm.BoardItem.make({
      id: Swarm.BoardItemID.create(),
      swarmID,
      kind: "task",
      title: "Ship swarm",
      body: "Implement the viewer",
      status: "in_progress",
      assigneeSessionID: to,
      createdBySessionID: from,
      timeCreated: 1,
      timeUpdated: 1,
    }),
  ],
  chat: [
    Swarm.Message.make({
      id: Swarm.MessageID.create(),
      swarmID,
      fromSessionID: from,
      fromAgent: "orchestrator",
      text: "hello board",
      timeCreated: Date.now(),
    }),
  ],
  dm: [
    Swarm.Message.make({
      id: Swarm.MessageID.create(),
      swarmID,
      fromSessionID: from,
      toSessionID: to,
      fromAgent: "manager",
      text: "please take the task",
      timeCreated: Date.now(),
    }),
  ],
}

describe("SwarmView.format", () => {
  test("renders board, chat, and direct messages", () => {
    const text = SwarmView.format(snapshot)
    expect(text).toContain(`Swarm ${swarmID}`)
    expect(text).toContain("enabled")
    expect(text).toContain("Board")
    expect(text).toContain("Ship swarm")
    expect(text).toContain("Chat")
    expect(text).toContain("orchestrator")
    expect(text).toContain("hello board")
    expect(text).toContain("Direct messages")
    expect(text).toContain("manager -> ses_to")
    expect(text).toContain("please take the task")
  })

  test("can show only direct messages", () => {
    const text = SwarmView.format(snapshot, "dm")
    expect(text).toContain("Direct messages")
    expect(text).toContain("please take the task")
    expect(text).not.toContain("Board")
    expect(text).not.toContain("hello board")
  })
})
