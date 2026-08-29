import { Effect, Schema } from "effect"
import { Swarm } from "@opencode-ai/schema/swarm"
import { SessionID } from "@opencode-ai/schema/session-id"
import { SwarmChat } from "@opencode-ai/core/swarm/chat"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import DESCRIPTION from "./swarm_dm.txt"

export const Parameters = Schema.Struct({
  action: Schema.Literals(["send", "history"]).annotate({
    description: "send posts a private message; history returns the inbox or a thread",
  }),
  to_session_id: Schema.optional(Schema.String).annotate({
    description: "Recipient session ID. Required for send; optional filter for history.",
  }),
  text: Schema.optional(Schema.String).annotate({ description: "Message body. Required for send." }),
  limit: Schema.optional(Schema.Number).annotate({ description: "Maximum messages to return for history (default 50)" }),
})

type Metadata = {
  id?: string
  count?: number
}

export const SwarmDMTool = Tool.define<typeof Parameters, Metadata, SwarmChat.Service | Config.Service>(
  "swarm_dm",
  Effect.gen(function* () {
    const chat = yield* SwarmChat.Service
    const config = yield* Config.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "swarm_dm",
            patterns: [params.action],
            always: ["*"],
            metadata: {},
          })
          const cfg = yield* config.get()
          const instance = yield* InstanceState.context
          const swarmID = Swarm.ID.make(cfg.swarm?.id ?? instance.project.id)
          if (params.action === "send") {
            if (!params.to_session_id) throw new Error("to_session_id is required when action is send")
            if (!params.text) throw new Error("text is required when action is send")
            const message = yield* chat.postDM({
              swarmID,
              fromSessionID: ctx.sessionID,
              toSessionID: SessionID.make(params.to_session_id),
              fromAgent: ctx.agent,
              text: params.text,
            })
            return {
              title: `DM sent to ${params.to_session_id}`,
              output: JSON.stringify(message, null, 2),
              metadata: { id: message.id },
            }
          }
          const messages = yield* chat.listDM({
            swarmID,
            sessionID: ctx.sessionID,
            ...(params.to_session_id ? { withSessionID: SessionID.make(params.to_session_id) } : {}),
            limit: params.limit ?? 50,
          })
          return {
            title: `${messages.length} direct messages`,
            output: JSON.stringify(messages, null, 2),
            metadata: { count: messages.length },
          }
        }),
    }
  }),
)
