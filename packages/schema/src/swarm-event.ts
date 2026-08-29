export * as SwarmEvent from "./swarm-event"

import { Schema } from "effect"
import { define, inventory } from "./event"
import { DateTimeUtcFromMillis, optional } from "./schema"
import { SessionID } from "./session-id"
import { Swarm } from "./swarm"

const options = {
  durable: {
    aggregate: "swarmID",
    version: 1,
  },
} as const

const Base = {
  timestamp: DateTimeUtcFromMillis,
  swarmID: Swarm.ID,
}

export const ChatPosted = define({
  type: "swarm.chat.posted",
  ...options,
  schema: {
    ...Base,
    messageID: Swarm.MessageID,
    fromSessionID: SessionID,
    fromAgent: Schema.String,
    text: Schema.String,
  },
})
export type ChatPosted = typeof ChatPosted.Type

export const DMPosted = define({
  type: "swarm.dm.posted",
  ...options,
  schema: {
    ...Base,
    messageID: Swarm.MessageID,
    fromSessionID: SessionID,
    toSessionID: SessionID,
    fromAgent: Schema.String,
    text: Schema.String,
  },
})
export type DMPosted = typeof DMPosted.Type

export const BoardItemCreated = define({
  type: "swarm.board.item.created",
  ...options,
  schema: {
    ...Base,
    itemID: Swarm.BoardItemID,
    kind: Swarm.BoardKind,
    title: Schema.String,
    body: Schema.String,
    status: Swarm.BoardStatus,
    createdBySessionID: SessionID,
    assigneeSessionID: SessionID.pipe(optional),
  },
})
export type BoardItemCreated = typeof BoardItemCreated.Type

export const BoardItemUpdated = define({
  type: "swarm.board.item.updated",
  ...options,
  schema: {
    ...Base,
    itemID: Swarm.BoardItemID,
    kind: Swarm.BoardKind,
    title: Schema.String,
    body: Schema.String,
    status: Swarm.BoardStatus,
    assigneeSessionID: SessionID.pipe(optional),
    lastNudgedAt: Schema.Finite.pipe(optional),
  },
})
export type BoardItemUpdated = typeof BoardItemUpdated.Type

export const DurableDefinitions = inventory(ChatPosted, DMPosted, BoardItemCreated, BoardItemUpdated)
export const Definitions = DurableDefinitions
