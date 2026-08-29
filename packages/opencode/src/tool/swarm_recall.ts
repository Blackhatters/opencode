import { Effect, Schema } from "effect"
import { Swarm } from "@opencode-ai/schema/swarm"
import { SwarmRAG } from "@opencode-ai/core/swarm/rag"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import DESCRIPTION from "./swarm_recall.txt"

export const Parameters = Schema.Struct({
  action: Schema.Literals(["query", "index"]).annotate({
    description: "query searches the project index; index rebuilds it from the workspace",
  }),
  text: Schema.optional(Schema.String).annotate({ description: "Search text. Required for query." }),
  topK: Schema.optional(Schema.Number).annotate({ description: "Maximum chunks to return (default 8)" }),
})

type Metadata = {
  count?: number
}

export const SwarmRecallTool = Tool.define<typeof Parameters, Metadata, SwarmRAG.Service | Config.Service>(
  "swarm_recall",
  Effect.gen(function* () {
    const rag = yield* SwarmRAG.Service
    const config = yield* Config.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "swarm_recall",
            patterns: [params.action],
            always: ["*"],
            metadata: {},
          })
          const cfg = yield* config.get()
          const instance = yield* InstanceState.context
          const swarmID = Swarm.ID.make(cfg.swarm?.id ?? instance.project.id)
          if (params.action === "index") {
            const count = yield* rag.index({ swarmID, directory: instance.directory })
            return {
              title: `Indexed ${count} chunks`,
              output: `Indexed ${count} project chunks into swarm memory.`,
              metadata: { count },
            }
          }
          if (!params.text) throw new Error("text is required when action is query")
          const results = yield* rag.query({
            swarmID,
            text: params.text,
            topK: params.topK ?? 8,
          })
          return {
            title: `${results.length} recalled chunks`,
            output: JSON.stringify(results, null, 2),
            metadata: { count: results.length },
          }
        }),
    }
  }),
)
