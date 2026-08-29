export * as SwarmChat from "./chat"

import { and, desc, eq, isNull, or } from "drizzle-orm"
import { Context, DateTime, Effect, Layer, Stream } from "effect"
import { Swarm } from "@opencode-ai/schema/swarm"
import { SwarmEvent } from "@opencode-ai/schema/swarm-event"
import type { SessionID } from "@opencode-ai/schema/session-id"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { EventV2 } from "../event"
import { SwarmMessageTable } from "./sql"

export const Event = SwarmEvent

export interface PostChatInput {
  readonly swarmID: Swarm.ID
  readonly fromSessionID: SessionID
  readonly fromAgent: string
  readonly text: string
}

export interface PostDMInput extends PostChatInput {
  readonly toSessionID: SessionID
}

export interface Interface {
  readonly postChat: (input: PostChatInput) => Effect.Effect<Swarm.Message>
  readonly postDM: (input: PostDMInput) => Effect.Effect<Swarm.Message>
  readonly listChat: (swarmID: Swarm.ID, limit?: number) => Effect.Effect<ReadonlyArray<Swarm.Message>>
  readonly listDM: (input: {
    readonly swarmID: Swarm.ID
    readonly sessionID: SessionID
    readonly withSessionID?: SessionID
    readonly limit?: number
  }) => Effect.Effect<ReadonlyArray<Swarm.Message>>
  readonly subscribe: (swarmID: Swarm.ID) => Stream.Stream<EventV2.Payload>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/SwarmChat") {}

const fromRow = (row: typeof SwarmMessageTable.$inferSelect): Swarm.Message =>
  Swarm.Message.make({
    id: row.id,
    swarmID: row.swarm_id,
    fromSessionID: row.from_session_id,
    ...(row.to_session_id ? { toSessionID: row.to_session_id } : {}),
    fromAgent: row.from_agent,
    text: row.text,
    timeCreated: row.time_created,
  })

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const events = yield* EventV2.Service

    const postChat = Effect.fn("SwarmChat.postChat")(function* (input: PostChatInput) {
      const id = Swarm.MessageID.create()
      const timestamp = yield* DateTime.now
      const timeCreated = DateTime.toEpochMillis(timestamp)
      yield* events.publish(
        SwarmEvent.ChatPosted,
        {
          timestamp,
          swarmID: input.swarmID,
          messageID: id,
          fromSessionID: input.fromSessionID,
          fromAgent: input.fromAgent,
          text: input.text,
        },
        {
          commit: () =>
            db
              .insert(SwarmMessageTable)
              .values({
                id,
                swarm_id: input.swarmID,
                from_session_id: input.fromSessionID,
                from_agent: input.fromAgent,
                text: input.text,
                time_created: timeCreated,
              })
              .run()
              .pipe(Effect.orDie),
        },
      )
      return Swarm.Message.make({
        id,
        swarmID: input.swarmID,
        fromSessionID: input.fromSessionID,
        fromAgent: input.fromAgent,
        text: input.text,
        timeCreated,
      })
    })

    const postDM = Effect.fn("SwarmChat.postDM")(function* (input: PostDMInput) {
      const id = Swarm.MessageID.create()
      const timestamp = yield* DateTime.now
      const timeCreated = DateTime.toEpochMillis(timestamp)
      yield* events.publish(
        SwarmEvent.DMPosted,
        {
          timestamp,
          swarmID: input.swarmID,
          messageID: id,
          fromSessionID: input.fromSessionID,
          toSessionID: input.toSessionID,
          fromAgent: input.fromAgent,
          text: input.text,
        },
        {
          commit: () =>
            db
              .insert(SwarmMessageTable)
              .values({
                id,
                swarm_id: input.swarmID,
                from_session_id: input.fromSessionID,
                to_session_id: input.toSessionID,
                from_agent: input.fromAgent,
                text: input.text,
                time_created: timeCreated,
              })
              .run()
              .pipe(Effect.orDie),
        },
      )
      return Swarm.Message.make({
        id,
        swarmID: input.swarmID,
        fromSessionID: input.fromSessionID,
        toSessionID: input.toSessionID,
        fromAgent: input.fromAgent,
        text: input.text,
        timeCreated,
      })
    })

    const listChat = Effect.fn("SwarmChat.listChat")(function* (swarmID: Swarm.ID, limit = 50) {
      const rows = yield* db
        .select()
        .from(SwarmMessageTable)
        .where(and(eq(SwarmMessageTable.swarm_id, swarmID), isNull(SwarmMessageTable.to_session_id)))
        .orderBy(desc(SwarmMessageTable.time_created))
        .limit(limit)
        .all()
        .pipe(Effect.orDie)
      return rows.map(fromRow).toReversed()
    })

    const listDM = Effect.fn("SwarmChat.listDM")(function* (input: {
      readonly swarmID: Swarm.ID
      readonly sessionID: SessionID
      readonly withSessionID?: SessionID
      readonly limit?: number
    }) {
      const peer = input.withSessionID
      const rows = yield* db
        .select()
        .from(SwarmMessageTable)
        .where(
          and(
            eq(SwarmMessageTable.swarm_id, input.swarmID),
            peer
              ? or(
                  and(eq(SwarmMessageTable.from_session_id, input.sessionID), eq(SwarmMessageTable.to_session_id, peer)),
                  and(eq(SwarmMessageTable.from_session_id, peer), eq(SwarmMessageTable.to_session_id, input.sessionID)),
                )
              : or(
                  eq(SwarmMessageTable.from_session_id, input.sessionID),
                  eq(SwarmMessageTable.to_session_id, input.sessionID),
                ),
          ),
        )
        .orderBy(desc(SwarmMessageTable.time_created))
        .limit(input.limit ?? 50)
        .all()
        .pipe(Effect.orDie)
      return rows.filter((row) => row.to_session_id !== null).map(fromRow).toReversed()
    })

    const subscribe = (swarmID: Swarm.ID) => events.durable({ aggregateID: swarmID })

    return Service.of({ postChat, postDM, listChat, listDM, subscribe })
  }),
)

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [Database.node, EventV2.node],
})
