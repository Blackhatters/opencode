export * as SwarmContext from "./context"

import { Effect, Layer, Schema } from "effect"
import { Swarm } from "@opencode-ai/schema/swarm"
import { Config } from "../config"
import { makeLocationNode } from "../effect/app-node"
import { Location } from "../location"
import { SystemContext } from "../system-context/index"
import { SystemContextRegistry } from "../system-context/registry"
import { SwarmBoard } from "./board"
import { SwarmChat } from "./chat"

const Snapshot = Schema.Struct({
  swarmID: Schema.String,
  board: Schema.String,
  chat: Schema.String,
})

function render(input: { swarmID: string; board: string; chat: string }) {
  return [
    "Shared swarm memory for this project.",
    "<swarm>",
    `  <id>${input.swarmID}</id>`,
    "  <board>",
    input.board,
    "  </board>",
    "  <chat>",
    input.chat,
    "  </chat>",
    "</swarm>",
  ].join("\n")
}

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const config = yield* Config.Service
    const location = yield* Location.Service
    const registry = yield* SystemContextRegistry.Service
    const board = yield* SwarmBoard.Service
    const chat = yield* SwarmChat.Service
    const entries = yield* config.entries()
    const swarm = Config.latest(entries, "swarm")
    if (swarm?.enabled !== true) return
    const swarmID = Swarm.ID.make(swarm.id ?? location.project.id)

    yield* registry.register({
      key: SystemContext.Key.make("core/swarm"),
      load: Effect.gen(function* () {
        const [items, messages] = yield* Effect.all([board.list({ swarmID }), chat.listChat(swarmID, 12)])
        const open = items.filter((item) => item.status !== "done")
        const value = {
          swarmID,
          board:
            open.length === 0
              ? "    (no open items)"
              : open
                  .map(
                    (item) =>
                      `    <item id="${item.id}" kind="${item.kind}" status="${item.status}">${item.title}</item>`,
                  )
                  .join("\n"),
          chat:
            messages.length === 0
              ? "    (empty)"
              : messages.map((message) => `    <message from="${message.fromAgent}">${message.text}</message>`).join("\n"),
        }
        return SystemContext.make({
          key: SystemContext.Key.make("core/swarm"),
          codec: Schema.toCodecJson(Snapshot),
          load: Effect.succeed(value),
          baseline: (current) => render(current),
          update: (_previous, current) => render(current),
        })
      }),
    })
  }),
)

export const node = makeLocationNode({
  name: "swarm-context",
  layer,
  deps: [Config.node, Location.node, SystemContextRegistry.node, SwarmBoard.node, SwarmChat.node],
})
