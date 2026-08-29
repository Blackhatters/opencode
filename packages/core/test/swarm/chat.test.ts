import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { EventV2 } from "@opencode-ai/core/event"
import { Swarm } from "@opencode-ai/schema/swarm"
import { SwarmEvent } from "@opencode-ai/schema/swarm-event"
import { SessionID } from "@opencode-ai/schema/session-id"
import { SwarmChat } from "@opencode-ai/core/swarm/chat"
import { testEffect } from "../lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, SwarmChat.node])))
const swarmID = Swarm.ID.make("swarm_chat_test")
const from = SessionID.make("ses_swarm_from")
const to = SessionID.make("ses_swarm_to")

describe("SwarmChat", () => {
  it.effect("posts global chat and lists it in order", () =>
    Effect.gen(function* () {
      const chat = yield* SwarmChat.Service
      yield* chat.postChat({ swarmID, fromSessionID: from, fromAgent: "orchestrator", text: "first" })
      yield* chat.postChat({ swarmID, fromSessionID: from, fromAgent: "manager", text: "second" })
      const messages = yield* chat.listChat(swarmID)
      expect(messages.map((message) => message.text)).toEqual(["first", "second"])
    }),
  )

  it.effect("posts a DM and keeps it out of the global channel", () =>
    Effect.gen(function* () {
      const chat = yield* SwarmChat.Service
      const events = yield* EventV2.Service
      const published = new Array<string>()
      const unsubscribe = yield* events.listen((event) =>
        Effect.sync(() => {
          if (event.type === SwarmEvent.DMPosted.type) published.push(event.type)
        }),
      )
      yield* Effect.addFinalizer(() => unsubscribe)

      yield* chat.postDM({
        swarmID,
        fromSessionID: from,
        toSessionID: to,
        fromAgent: "manager",
        text: "private",
      })
      expect((yield* chat.listChat(swarmID)).map((message) => message.text)).not.toContain("private")
      const inbox = yield* chat.listDM({ swarmID, sessionID: to })
      expect(inbox.map((message) => message.text)).toEqual(["private"])
      expect(published).toEqual([SwarmEvent.DMPosted.type])
    }),
  )
})
