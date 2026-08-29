import { describe, expect } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { Config } from "@opencode-ai/core/config"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { EventV2 } from "@opencode-ai/core/event"
import { Location } from "@opencode-ai/core/location"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { Swarm } from "@opencode-ai/schema/swarm"
import { SessionID } from "@opencode-ai/schema/session-id"
import { SwarmBoard } from "@opencode-ai/core/swarm/board"
import { SwarmChat } from "@opencode-ai/core/swarm/chat"
import { SwarmContext } from "@opencode-ai/core/swarm/context"
import { SystemContext } from "@opencode-ai/core/system-context"
import { SystemContextRegistry } from "@opencode-ai/core/system-context/registry"
import { location } from "../fixture/location"
import { testEffect } from "../lib/effect"

const decode = Schema.decodeUnknownSync(Config.Info)
const from = SessionID.make("ses_swarm_context")
const to = SessionID.make("ses_swarm_context_to")

function swarmLayer(swarm: {
  enabled: true
  id: string
  board_diff?: boolean
  chat_diff?: boolean
  dm_diff?: boolean
}) {
  return AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      EventV2.node,
      SwarmBoard.node,
      SwarmChat.node,
      SystemContextRegistry.node,
      SwarmContext.node,
    ]),
    [
      [
        Config.node,
        Layer.succeed(
          Config.Service,
          Config.Service.of({
            entries: () =>
              Effect.succeed([
                new Config.Document({
                  type: "document",
                  info: decode({ swarm }),
                }),
              ]),
          }),
        ),
      ],
      [
        Location.node,
        Layer.succeed(
          Location.Service,
          Location.Service.of(location({ directory: AbsolutePath.make("/tmp/swarm-context") })),
        ),
      ],
    ],
  )
}

const itDiff = testEffect(swarmLayer({ enabled: true, id: "swarm_context_diff" }))
const itFull = testEffect(
  swarmLayer({ enabled: true, id: "swarm_context_full", board_diff: false, chat_diff: false, dm_diff: false }),
)

describe("SwarmContext", () => {
  itDiff.effect("starts new sessions with empty board, chat, and DMs and diffs later changes", () =>
    Effect.gen(function* () {
      const board = yield* SwarmBoard.Service
      const chat = yield* SwarmChat.Service
      const registry = yield* SystemContextRegistry.Service
      const swarmID = Swarm.ID.make("swarm_context_diff")
      yield* board.create({
        swarmID,
        kind: "task",
        title: "already on board",
        body: "old work",
        createdBySessionID: from,
      })
      yield* chat.postChat({ swarmID, fromSessionID: from, fromAgent: "orchestrator", text: "already posted" })
      yield* chat.postDM({
        swarmID,
        fromSessionID: from,
        toSessionID: to,
        fromAgent: "orchestrator",
        text: "already dm'd",
      })

      const initialized = yield* SystemContext.initialize(yield* registry.load())
      expect(initialized.baseline).toContain("<board>\n    (empty)\n  </board>")
      expect(initialized.baseline).toContain("<chat>\n    (empty)\n  </chat>")
      expect(initialized.baseline).toContain("<dm>\n    (empty)\n  </dm>")
      expect(initialized.baseline).not.toContain("already on board")
      expect(initialized.baseline).not.toContain("already posted")
      expect(initialized.baseline).not.toContain("already dm'd")

      yield* board.create({
        swarmID,
        kind: "task",
        title: "new work",
        body: "fresh",
        createdBySessionID: from,
      })
      yield* chat.postChat({ swarmID, fromSessionID: from, fromAgent: "manager", text: "just now" })
      yield* chat.postDM({
        swarmID,
        fromSessionID: from,
        toSessionID: to,
        fromAgent: "manager",
        text: "new dm",
      })
      const result = yield* SystemContext.reconcile(yield* registry.load(), initialized.snapshot)
      expect(result._tag).toBe("Updated")
      if (result._tag !== "Updated") return
      expect(result.text).toContain("Swarm board updates:")
      expect(result.text).toContain("new work")
      expect(result.text).not.toContain("already on board")
      expect(result.text).toContain("New swarm chat messages:")
      expect(result.text).toContain("just now")
      expect(result.text).not.toContain("already posted")
      expect(result.text).toContain("New swarm direct messages:")
      expect(result.text).toContain("new dm")
      expect(result.text).not.toContain("already dm'd")
    }),
  )

  itFull.effect("includes recent board, chat, and DMs in the baseline when diffs are disabled", () =>
    Effect.gen(function* () {
      const board = yield* SwarmBoard.Service
      const chat = yield* SwarmChat.Service
      const registry = yield* SystemContextRegistry.Service
      const swarmID = Swarm.ID.make("swarm_context_full")
      yield* board.create({
        swarmID,
        kind: "goal",
        title: "keep this board",
        body: "goal body",
        createdBySessionID: from,
      })
      yield* chat.postChat({ swarmID, fromSessionID: from, fromAgent: "orchestrator", text: "keep this chat" })
      yield* chat.postDM({
        swarmID,
        fromSessionID: from,
        toSessionID: to,
        fromAgent: "orchestrator",
        text: "keep this dm",
      })

      const initialized = yield* SystemContext.initialize(yield* registry.load())
      expect(initialized.baseline).toContain("keep this board")
      expect(initialized.baseline).toContain('<message from="orchestrator">keep this chat</message>')
      expect(initialized.baseline).toContain("keep this dm")
      expect(initialized.baseline).not.toContain("(empty)")
    }),
  )
})
