import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { EventV2 } from "@opencode-ai/core/event"
import { Swarm } from "@opencode-ai/schema/swarm"
import { SessionID } from "@opencode-ai/schema/session-id"
import { SwarmBoard } from "@opencode-ai/core/swarm/board"
import { testEffect } from "../lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, SwarmBoard.node])))
const swarmID = Swarm.ID.make("swarm_board_test")
const owner = SessionID.make("ses_swarm_owner")

describe("SwarmBoard", () => {
  it.effect("creates, lists, updates, and gets board items", () =>
    Effect.gen(function* () {
      const board = yield* SwarmBoard.Service
      const created = yield* board.create({
        swarmID,
        kind: "task",
        title: "Ship swarm",
        body: "Implement the board",
        createdBySessionID: owner,
      })
      expect(created.status).toBe("open")
      expect((yield* board.list({ swarmID, kind: "task" })).map((item) => item.id)).toEqual([created.id])

      const updated = yield* board.update({ id: created.id, status: "in_progress" })
      expect(updated?.status).toBe("in_progress")
      expect((yield* board.get(created.id))?.title).toBe("Ship swarm")
    }),
  )
})
