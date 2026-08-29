import { describe, expect, test } from "bun:test"
import { Swarm } from "@opencode-ai/schema/swarm"
import { SwarmRAG } from "@opencode-ai/core/swarm/rag"
import { SwarmVault } from "@/swarm/vault"

const swarmID = "proj_swarm_vault"

function chunk(input: { path: string; text: string; embedding: number[]; chunkIndex?: number }): SwarmRAG.Chunk {
  return {
    id: Swarm.RAGChunkID.create(),
    path: input.path,
    chunkIndex: input.chunkIndex ?? 0,
    text: input.text,
    embedding: input.embedding,
  }
}

describe("SwarmVault.render", () => {
  test("writes an index and notes with wikilinks", () => {
    const notes = SwarmVault.render({
      swarmID,
      chunks: [
        chunk({ path: "src/rag.ts", text: "recall index", embedding: [1, 0] }),
        chunk({ path: "readme.md", text: "goal board", embedding: [0.9, 0.1] }),
        chunk({ path: "other.py", text: "unrelated", embedding: [0, 1] }),
      ],
    })
    const index = notes.find((note) => note.path === "index.md")
    expect(index?.body).toContain("[[src/rag.ts]]")
    expect(index?.body).toContain("[[readme]]")
    expect(notes.map((note) => note.path)).toEqual(["index.md", "other.py.md", "readme.md", "src/rag.ts.md"])
    const rag = notes.find((note) => note.path === "src/rag.ts.md")
    expect(rag?.body).toContain("source: \"src/rag.ts\"")
    expect(rag?.body).toContain("## Chunk 0")
    expect(rag?.body).toContain("recall index")
    expect(rag?.body).toContain("[[readme]]")
  })

  test("skips paths that escape the vault", () => {
    const notes = SwarmVault.render({
      swarmID,
      chunks: [chunk({ path: "../secret.md", text: "nope", embedding: [1] })],
    })
    expect(notes.map((note) => note.path)).toEqual(["index.md"])
    expect(notes[0]?.body).toContain("No indexed files")
  })
})
