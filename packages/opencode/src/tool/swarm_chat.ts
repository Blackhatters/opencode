import { Effect, Schema } from "effect"
import { Swarm } from "@opencode-ai/schema/swarm"
import { SwarmChat } from "@opencode-ai/core/swarm/chat"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import DESCRIPTION from "./swarm_chat.txt"

export const Parameters = Schema.Struct({
  action: Schema.Literals(["send", "history"]).annotate({
    description: "send posts to the global swarm channel; history returns recent broadcasts",
  }),
  text: Schema.optional(Schema.String).annotate({ description: "Message body. Required for send." }),
  limit: Schema.optional(Schema.Number).annotate({ description: "Maximum messages to return for history (default 50)" }),
})

type Metadata = {
  id?: string
  count?: number
}

export const SwarmChatTool = Tool.define<typeof Parameters, Metadata, SwarmChat.Service | Config.Service>(
  "swarm_chat",
  Effect.gen(function* () {
    const chat = yield* SwarmChat.Service
    const config = yield* Config.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "swarm_chat",
            patterns: [params.action],
            always: ["*"],
            metadata: {},
          })
          const cfg = yield* config.get()
          const instance = yield* InstanceState.context
          const swarmID = Swarm.ID.make(cfg.swarm?.id ?? instance.project.id)
          if (params.action === "send") {
            if (!params.text) throw new Error("text is required when action is send")
            const message = yield* chat.postChat({
              swarmID,
              fromSessionID: ctx.sessionID,
              fromAgent: ctx.agent,
              text: params.text,
            })
            return {
              title: "Posted to swarm chat",
              output: JSON.stringify(message, null, 2),
              metadata: { id: message.id },
            }
          }
          const messages = yield* chat.listChat(swarmID, params.limit ?? 50)
          return {
            title: `${messages.length} swarm chat messages`,
            output: JSON.stringify(messages, null, 2),
            metadata: { count: messages.length },
          }
        }),
    }
  }),
)
