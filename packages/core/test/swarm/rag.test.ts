import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Swarm } from "@opencode-ai/schema/swarm"
import { SwarmRAG } from "@opencode-ai/core/swarm/rag"
import { testEffect } from "../lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, FSUtil.node, SwarmRAG.node])))
const swarmID = Swarm.ID.make("swarm_rag_test")

describe("SwarmRAG", () => {
  it.effect("indexes a directory and returns related chunks", () =>
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const rag = yield* SwarmRAG.Service
      const directory = yield* fs.makeTempDirectoryScoped()
      yield* fs.writeFileString(
        `${directory}/readme.md`,
        "Swarm agents share a goal board and a project recall index for reusable context.",
      )
      yield* fs.ensureDir(`${directory}/node_modules`)
      yield* fs.writeFileString(`${directory}/node_modules/skip.md`, "this should not be indexed")
      const count = yield* rag.index({ swarmID, directory })
      expect(count).toBeGreaterThan(0)
      const results = yield* rag.query({ swarmID, text: "goal board recall", topK: 3 })
      expect(results.length).toBeGreaterThan(0)
      expect(results[0]?.path).toBe("readme.md")
      expect(results.some((item) => item.path.includes("node_modules"))).toBe(false)
    }),
  )
})
