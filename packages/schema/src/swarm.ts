export * as Swarm from "./swarm"

import { Schema } from "effect"
import { descending } from "./identifier"
import { statics } from "./schema"
import { SessionID } from "./session-id"

export const ID = Schema.String.pipe(Schema.brand("Swarm.ID"), statics((schema) => ({ make: schema.make })))
export type ID = typeof ID.Type

export const MessageID = Schema.String.check(Schema.isStartsWith("swm_")).pipe(
  Schema.brand("Swarm.MessageID"),
  statics((schema) => ({
    create: () => schema.make("swm_" + descending()),
  })),
)
export type MessageID = typeof MessageID.Type

export const BoardItemID = Schema.String.check(Schema.isStartsWith("brd_")).pipe(
  Schema.brand("Swarm.BoardItemID"),
  statics((schema) => ({
    create: () => schema.make("brd_" + descending()),
  })),
)
export type BoardItemID = typeof BoardItemID.Type

export const RAGChunkID = Schema.String.check(Schema.isStartsWith("rag_")).pipe(
  Schema.brand("Swarm.RAGChunkID"),
  statics((schema) => ({
    create: () => schema.make("rag_" + descending()),
  })),
)
export type RAGChunkID = typeof RAGChunkID.Type

export const BoardKind = Schema.Literals(["goal", "task", "note"])
export type BoardKind = typeof BoardKind.Type

export const BoardStatus = Schema.Literals(["open", "in_progress", "done", "blocked"])
export type BoardStatus = typeof BoardStatus.Type

export const Message = Schema.Struct({
  id: MessageID,
  swarmID: ID,
  fromSessionID: SessionID,
  toSessionID: SessionID.pipe(Schema.optional),
  fromAgent: Schema.String,
  text: Schema.String,
  timeCreated: Schema.Finite,
}).annotate({ identifier: "Swarm.Message" })
export interface Message extends Schema.Schema.Type<typeof Message> {}

export const BoardItem = Schema.Struct({
  id: BoardItemID,
  swarmID: ID,
  kind: BoardKind,
  title: Schema.String,
  body: Schema.String,
  status: BoardStatus,
  assigneeSessionID: SessionID.pipe(Schema.optional),
  createdBySessionID: SessionID,
  lastNudgedAt: Schema.optional(Schema.Finite),
  timeCreated: Schema.Finite,
  timeUpdated: Schema.Finite,
}).annotate({ identifier: "Swarm.BoardItem" })
export interface BoardItem extends Schema.Schema.Type<typeof BoardItem> {}

export const RAGChunk = Schema.Struct({
  id: RAGChunkID,
  swarmID: ID,
  path: Schema.String,
  chunkIndex: Schema.Finite,
  text: Schema.String,
  score: Schema.optional(Schema.Finite),
}).annotate({ identifier: "Swarm.RAGChunk" })
export interface RAGChunk extends Schema.Schema.Type<typeof RAGChunk> {}
