export * as SwarmContext from "./context"

import { Effect, Layer, Schema } from "effect"
import { Swarm } from "@opencode-ai/schema/swarm"
import { Config } from "../config"
import { ConfigSwarm } from "../config/swarm"
import { makeLocationNode } from "../effect/app-node"
import { Location } from "../location"
import { SystemContext } from "../system-context/index"
import { SystemContextRegistry } from "../system-context/registry"
import { SwarmBoard } from "./board"
import { SwarmChat } from "./chat"
import { SwarmSnapshot } from "./snapshot"

const Snapshot = Schema.Struct({
  swarmID: Schema.String,
  text: Schema.String,
})

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const config = yield* Config.Service
    const location = yield* Location.Service
    const registry = yield* SystemContextRegistry.Service
    const board = yield* SwarmBoard.Service
    const chat = yield* SwarmChat.Service
    const entries = yield* config.entries()
    const swarm = ConfigSwarm.fromDocuments(
      entries.flatMap((entry) => (entry.type === "document" && entry.info.swarm ? [entry.info.swarm] : [])),
    )
    if (swarm?.enabled !== true) return
    const swarmID = Swarm.ID.make(swarm.id ?? location.project.id)

    yield* registry.register({
      key: SystemContext.Key.make("core/swarm"),
      load: Effect.gen(function* () {
        const [items, messages] = yield* Effect.all([board.list({ swarmID }), chat.listChat(swarmID, 12)])
        const value = {
          swarmID,
          text: SwarmSnapshot.render({ swarmID, items, messages }),
        }
        return SystemContext.make({
          key: SystemContext.Key.make("core/swarm"),
          codec: Schema.toCodecJson(Snapshot),
          load: Effect.succeed(value),
          baseline: (current) => current.text,
          update: (_previous, current) => current.text,
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
