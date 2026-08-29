export * as SwarmRAG from "./rag"

import { eq } from "drizzle-orm"
import { relative, sep } from "path"
import { Context, Effect, Layer } from "effect"
import { Swarm } from "@opencode-ai/schema/swarm"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { FSUtil } from "../fs-util"
import { SwarmRAGTable } from "./sql"

const DIMENSIONS = 256
const CHUNK_SIZE = 800
const SKIP = new Set(["node_modules", ".git", "dist", ".opencode", "coverage", ".turbo"])

export interface QueryResult {
  readonly id: Swarm.RAGChunkID
  readonly path: string
  readonly chunkIndex: number
  readonly text: string
  readonly score: number
}

export interface Interface {
  readonly index: (input: { readonly swarmID: Swarm.ID; readonly directory: string }) => Effect.Effect<number>
  readonly query: (input: {
    readonly swarmID: Swarm.ID
    readonly text: string
    readonly topK?: number
  }) => Effect.Effect<ReadonlyArray<QueryResult>>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/SwarmRAG") {}

function embed(text: string) {
  const vector = new Array<number>(DIMENSIONS).fill(0)
  const normalized = text.toLowerCase()
  for (let i = 0; i < normalized.length - 2; i++) {
    const trigram = normalized.slice(i, i + 3)
    let hash = 0
    for (let j = 0; j < trigram.length; j++) hash = (hash * 31 + trigram.charCodeAt(j)) >>> 0
    vector[hash % DIMENSIONS] += 1
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (magnitude === 0) return vector
  return vector.map((value) => value / magnitude)
}

function cosine(left: number[], right: number[]) {
  let sum = 0
  for (let i = 0; i < DIMENSIONS; i++) sum += (left[i] ?? 0) * (right[i] ?? 0)
  return sum
}

function chunks(text: string) {
  const parts: string[] = []
  for (let i = 0; i < text.length; i += CHUNK_SIZE) parts.push(text.slice(i, i + CHUNK_SIZE))
  return parts.filter((part) => part.trim().length > 0)
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const fs = yield* FSUtil.Service

    const index = Effect.fn("SwarmRAG.index")(function* (input: {
      readonly swarmID: Swarm.ID
      readonly directory: string
    }) {
      const files = yield* fs
        .glob("**/*.{ts,tsx,js,jsx,md,json,py,go,rs,css,html}", {
          cwd: input.directory,
          absolute: true,
        })
        .pipe(Effect.orDie)
      const selected = files
        .filter((file) => !skipped(file))
        .toSorted((left, right) => left.localeCompare(right))
        .slice(0, 400)
      const written = yield* db
        .transaction(() =>
          Effect.gen(function* () {
            yield* db.delete(SwarmRAGTable).where(eq(SwarmRAGTable.swarm_id, input.swarmID)).run().pipe(Effect.orDie)
            return yield* Effect.forEach(
              selected,
              (file) =>
                Effect.gen(function* () {
                  const text = yield* fs.readFileStringSafe(file).pipe(Effect.orDie)
                  if (!text) return 0
                  const parts = chunks(text)
                  yield* Effect.forEach(
                    parts,
                    (part, chunkIndex) =>
                      db
                        .insert(SwarmRAGTable)
                        .values({
                          id: Swarm.RAGChunkID.create(),
                          swarm_id: input.swarmID,
                          path: workspacePath(input.directory, file),
                          chunk_index: chunkIndex,
                          text: part,
                          embedding: embed(part),
                        })
                        .run()
                        .pipe(Effect.orDie),
                    { concurrency: 1 },
                  )
                  return parts.length
                }),
              { concurrency: 1 },
            )
          }),
        )
        .pipe(Effect.orDie)
      return written.reduce((sum, count) => sum + count, 0)
    })

    const query = Effect.fn("SwarmRAG.query")(function* (input: {
      readonly swarmID: Swarm.ID
      readonly text: string
      readonly topK?: number
    }) {
      const target = embed(input.text)
      const rows = yield* db
        .select()
        .from(SwarmRAGTable)
        .where(eq(SwarmRAGTable.swarm_id, input.swarmID))
        .all()
        .pipe(Effect.orDie)
      return rows
        .map((row) => ({
          id: row.id,
          path: row.path,
          chunkIndex: row.chunk_index,
          text: row.text,
          score: cosine(target, row.embedding),
        }))
        .toSorted((a, b) => b.score - a.score)
        .slice(0, input.topK ?? 8)
    })

    return Service.of({ index, query })
  }),
)

function skipped(file: string) {
  return file.split(/[\\/]/).some((part) => SKIP.has(part))
}

function workspacePath(directory: string, file: string) {
  const next = relative(directory, file)
  if (!next || next === ".." || next.startsWith(`..${sep}`)) return file.split(/[\\/]/).join("/")
  return next.split(sep).join("/")
}

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node, FSUtil.node] })
