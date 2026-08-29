import { Effect, Schema } from "effect"
import { Swarm } from "@opencode-ai/schema/swarm"
import { SessionID } from "@opencode-ai/schema/session-id"
import { SwarmBoard } from "@opencode-ai/core/swarm/board"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import DESCRIPTION from "./swarm_board.txt"

export const Parameters = Schema.Struct({
  action: Schema.Literals(["create", "update", "list", "get"]).annotate({
    description: "create a board item, update one, list matching items, or get by id",
  }),
  id: Schema.optional(Schema.String).annotate({ description: "Board item ID. Required for update and get." }),
  kind: Schema.optional(Swarm.BoardKind).annotate({ description: "goal, task, or note. Required for create." }),
  title: Schema.optional(Schema.String).annotate({ description: "Short title. Required for create." }),
  body: Schema.optional(Schema.String).annotate({ description: "Details. Required for create." }),
  status: Schema.optional(Swarm.BoardStatus).annotate({
    description: "open, in_progress, done, or blocked",
  }),
  assignee: Schema.optional(Schema.String).annotate({ description: "Session ID that should own this item" }),
})

type Metadata = {
  id?: string
  count?: number
}

export const SwarmBoardTool = Tool.define<typeof Parameters, Metadata, SwarmBoard.Service | Config.Service>(
  "swarm_board",
  Effect.gen(function* () {
    const board = yield* SwarmBoard.Service
    const config = yield* Config.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "swarm_board",
            patterns: [params.action],
            always: ["*"],
            metadata: {},
          })
          const cfg = yield* config.get()
          const instance = yield* InstanceState.context
          const swarmID = Swarm.ID.make(cfg.swarm?.id ?? instance.project.id)
          if (params.action === "create") {
            if (!params.kind || !params.title || params.body === undefined)
              throw new Error("kind, title, and body are required when action is create")
            const item = yield* board.create({
              swarmID,
              kind: params.kind,
              title: params.title,
              body: params.body,
              createdBySessionID: ctx.sessionID,
              ...(params.assignee ? { assigneeSessionID: SessionID.make(params.assignee) } : {}),
              ...(params.status ? { status: params.status } : {}),
            })
            return {
              title: `Created ${item.kind}: ${item.title}`,
              output: JSON.stringify(item, null, 2),
              metadata: { id: item.id },
            }
          }
          if (params.action === "update") {
            if (!params.id) throw new Error("id is required when action is update")
            const item = yield* board.update({
              id: Swarm.BoardItemID.make(params.id),
              ...(params.title ? { title: params.title } : {}),
              ...(params.body !== undefined ? { body: params.body } : {}),
              ...(params.status ? { status: params.status } : {}),
              ...(params.assignee ? { assigneeSessionID: SessionID.make(params.assignee) } : {}),
            })
            if (!item) throw new Error(`Board item not found: ${params.id}`)
            return {
              title: `Updated ${item.kind}: ${item.title}`,
              output: JSON.stringify(item, null, 2),
              metadata: { id: item.id },
            }
          }
          if (params.action === "get") {
            if (!params.id) throw new Error("id is required when action is get")
            const item = yield* board.get(Swarm.BoardItemID.make(params.id))
            if (!item) throw new Error(`Board item not found: ${params.id}`)
            return {
              title: item.title,
              output: JSON.stringify(item, null, 2),
              metadata: { id: item.id },
            }
          }
          const items = yield* board.list({
            swarmID,
            ...(params.kind ? { kind: params.kind } : {}),
            ...(params.status ? { status: params.status } : {}),
          })
          return {
            title: `${items.length} board items`,
            output: JSON.stringify(items, null, 2),
            metadata: { count: items.length },
          }
        }),
    }
  }),
)
