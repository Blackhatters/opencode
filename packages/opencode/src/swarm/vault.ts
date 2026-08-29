export * as SwarmVault from "./vault"

import path from "path"
import { Effect } from "effect"
import { Swarm } from "@opencode-ai/schema/swarm"
import { SwarmRAG } from "@opencode-ai/core/swarm/rag"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Config } from "@/config/config"
import { InstanceRef } from "@/effect/instance-ref"

const RELATED = 5
const RELATED_MIN = 0.2

export interface Note {
  readonly path: string
  readonly body: string
}

export function render(input: { readonly swarmID: string; readonly chunks: ReadonlyArray<SwarmRAG.Chunk> }) {
  const chunks = input.chunks.filter((chunk) => safeRel(chunk.path))
  const files = [...new Set(chunks.map((chunk) => chunk.path))].toSorted((left, right) => left.localeCompare(right))
  const grouped = files.map((source) => ({
    source,
    chunks: chunks.filter((chunk) => chunk.path === source),
  }))
  const vectors = new Map(grouped.map((file) => [file.source, average(file.chunks.map((chunk) => chunk.embedding))]))
  return [
    {
      path: "index.md",
      body: indexBody({
        swarmID: input.swarmID,
        files,
        chunks: chunks.length,
      }),
    },
    ...grouped.map((file) => ({
      path: notePath(file.source),
      body: noteBody({
        swarmID: input.swarmID,
        source: file.source,
        chunks: file.chunks,
        related: neighbors(file.source, vectors),
      }),
    })),
  ]
}

export const write = Effect.fn("SwarmVault.write")(function* (input: {
  readonly directory?: string
  readonly swarmID?: string
  readonly reindex?: boolean
}) {
  const config = yield* Config.Service
  const rag = yield* SwarmRAG.Service
  const fs = yield* FSUtil.Service
  const ctx = yield* InstanceRef
  if (!ctx) return yield* Effect.die("InstanceRef not provided")
  const cfg = yield* config.get()
  const swarmID = Swarm.ID.make(input.swarmID ?? cfg.swarm?.id ?? ctx.project.id)
  const directory = path.resolve(input.directory ?? path.join(ctx.directory, ".opencode", "swarm-rag"))
  if (input.reindex) yield* rag.index({ swarmID, directory: ctx.directory })
  const listed = yield* rag.list(swarmID)
  const chunks =
    listed.length > 0 || input.reindex
      ? listed
      : yield* rag.index({ swarmID, directory: ctx.directory }).pipe(Effect.andThen(rag.list(swarmID)))
  const notes = render({ swarmID, chunks })
  yield* fs.ensureDir(directory).pipe(Effect.orDie)
  const stale = yield* fs.glob("**/*.md", { cwd: directory, absolute: true }).pipe(Effect.orDie)
  yield* Effect.forEach(stale, (file) => fs.remove(file).pipe(Effect.orDie), { concurrency: "unbounded" })
  yield* Effect.forEach(
    notes,
    (note) => fs.writeWithDirs(path.join(directory, note.path), note.body).pipe(Effect.orDie),
    { concurrency: "unbounded" },
  )
  return {
    directory,
    swarmID,
    files: notes.length - 1,
    chunks: chunks.length,
  }
})

function indexBody(input: { readonly swarmID: string; readonly files: ReadonlyArray<string>; readonly chunks: number }) {
  return [
    "---",
    `swarm: ${JSON.stringify(input.swarmID)}`,
    `files: ${input.files.length}`,
    `chunks: ${input.chunks}`,
    "---",
    "",
    "# Swarm RAG",
    "",
    "Open this folder as an Obsidian vault to browse the project index.",
    "",
    "## Files",
    "",
    ...(input.files.length === 0
      ? ["No indexed files. Run `opencode swarm export --reindex` after enabling swarm."]
      : input.files.map((source) => `- [[${wikiLink(source)}]]`)),
    "",
  ].join("\n")
}

function noteBody(input: {
  readonly swarmID: string
  readonly source: string
  readonly chunks: ReadonlyArray<SwarmRAG.Chunk>
  readonly related: ReadonlyArray<string>
}) {
  return [
    "---",
    `swarm: ${JSON.stringify(input.swarmID)}`,
    `source: ${JSON.stringify(input.source)}`,
    `chunks: ${input.chunks.length}`,
    "---",
    "",
    `# ${input.source}`,
    "",
    ...(input.related.length === 0
      ? []
      : ["## Related", "", ...input.related.map((source) => `- [[${wikiLink(source)}]]`), ""]),
    ...input.chunks.flatMap((chunk) => [`## Chunk ${chunk.chunkIndex}`, "", fence(chunk.text), ""]),
  ].join("\n")
}

function neighbors(source: string, vectors: ReadonlyMap<string, ReadonlyArray<number>>) {
  const origin = vectors.get(source)
  if (!origin) return []
  return [...vectors.entries()]
    .filter(([path]) => path !== source)
    .map(([path, vector]) => ({ path, score: cosine(origin, vector) }))
    .filter((item) => item.score >= RELATED_MIN)
    .toSorted((left, right) => right.score - left.score)
    .slice(0, RELATED)
    .map((item) => item.path)
}

function average(vectors: ReadonlyArray<ReadonlyArray<number>>) {
  const first = vectors[0]
  if (!first) return []
  const sum = first.map(() => 0)
  for (const vector of vectors) {
    for (let i = 0; i < sum.length; i++) sum[i] += vector[i] ?? 0
  }
  return sum.map((value) => value / vectors.length)
}

function cosine(left: ReadonlyArray<number>, right: ReadonlyArray<number>) {
  let sum = 0
  for (let i = 0; i < left.length; i++) sum += (left[i] ?? 0) * (right[i] ?? 0)
  return sum
}

function notePath(source: string) {
  if (source.endsWith(".md")) return source
  return `${source}.md`
}

function wikiLink(source: string) {
  return notePath(source).replace(/\.md$/, "")
}

function safeRel(source: string) {
  const normalized = source.replaceAll("\\", "/").replace(/^\/+/, "")
  return normalized.length > 0 && !normalized.split("/").includes("..")
}

function fence(text: string) {
  const match = text.match(/`+/g)
  const ticks = match ? Math.max(3, ...match.map((item) => item.length + 1)) : 3
  const mark = "`".repeat(ticks)
  return `${mark}\n${text}\n${mark}`
}
