export * as SwarmBoard from "./board"

import { and, desc, eq } from "drizzle-orm"
import { Context, DateTime, Effect, Layer } from "effect"
import { Swarm } from "@opencode-ai/schema/swarm"
import { SwarmEvent } from "@opencode-ai/schema/swarm-event"
import type { SessionID } from "@opencode-ai/schema/session-id"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { EventV2 } from "../event"
import { SwarmBoardTable } from "./sql"

export const Event = SwarmEvent

export interface CreateInput {
  readonly swarmID: Swarm.ID
  readonly kind: Swarm.BoardKind
  readonly title: string
  readonly body: string
  readonly createdBySessionID: SessionID
  readonly assigneeSessionID?: SessionID
  readonly status?: Swarm.BoardStatus
}

export interface UpdateInput {
  readonly id: Swarm.BoardItemID
  readonly title?: string
  readonly body?: string
  readonly status?: Swarm.BoardStatus
  readonly assigneeSessionID?: SessionID | null
  readonly lastNudgedAt?: number | null
}

export interface ListInput {
  readonly swarmID: Swarm.ID
  readonly kind?: Swarm.BoardKind
  readonly status?: Swarm.BoardStatus
}

export interface Interface {
  readonly create: (input: CreateInput) => Effect.Effect<Swarm.BoardItem>
  readonly update: (input: UpdateInput) => Effect.Effect<Swarm.BoardItem | undefined>
  readonly get: (id: Swarm.BoardItemID) => Effect.Effect<Swarm.BoardItem | undefined>
  readonly list: (input: ListInput) => Effect.Effect<ReadonlyArray<Swarm.BoardItem>>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/SwarmBoard") {}

const fromRow = (row: typeof SwarmBoardTable.$inferSelect): Swarm.BoardItem =>
  Swarm.BoardItem.make({
    id: row.id,
    swarmID: row.swarm_id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    status: row.status,
    ...(row.assignee_session_id ? { assigneeSessionID: row.assignee_session_id } : {}),
    createdBySessionID: row.created_by_session_id,
    ...(row.last_nudged_at === null ? {} : { lastNudgedAt: row.last_nudged_at }),
    timeCreated: row.time_created,
    timeUpdated: row.time_updated,
  })

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const events = yield* EventV2.Service

    const create = Effect.fn("SwarmBoard.create")(function* (input: CreateInput) {
      const id = Swarm.BoardItemID.create()
      const timestamp = yield* DateTime.now
      const now = DateTime.toEpochMillis(timestamp)
      const status = input.status ?? "open"
      yield* events.publish(
        SwarmEvent.BoardItemCreated,
        {
          timestamp,
          swarmID: input.swarmID,
          itemID: id,
          kind: input.kind,
          title: input.title,
          body: input.body,
          status,
          createdBySessionID: input.createdBySessionID,
          ...(input.assigneeSessionID ? { assigneeSessionID: input.assigneeSessionID } : {}),
        },
        {
          commit: () =>
            db
              .insert(SwarmBoardTable)
              .values({
                id,
                swarm_id: input.swarmID,
                kind: input.kind,
                title: input.title,
                body: input.body,
                status,
                assignee_session_id: input.assigneeSessionID,
                created_by_session_id: input.createdBySessionID,
                time_created: now,
                time_updated: now,
              })
              .run()
              .pipe(Effect.orDie),
        },
      )
      return Swarm.BoardItem.make({
        id,
        swarmID: input.swarmID,
        kind: input.kind,
        title: input.title,
        body: input.body,
        status,
        ...(input.assigneeSessionID ? { assigneeSessionID: input.assigneeSessionID } : {}),
        createdBySessionID: input.createdBySessionID,
        timeCreated: now,
        timeUpdated: now,
      })
    })

    const get = Effect.fn("SwarmBoard.get")(function* (id: Swarm.BoardItemID) {
      const row = yield* db.select().from(SwarmBoardTable).where(eq(SwarmBoardTable.id, id)).get().pipe(Effect.orDie)
      return row ? fromRow(row) : undefined
    })

    const update = Effect.fn("SwarmBoard.update")(function* (input: UpdateInput) {
      const current = yield* get(input.id)
      if (!current) return
      const timestamp = yield* DateTime.now
      const next = {
        title: input.title ?? current.title,
        body: input.body ?? current.body,
        status: input.status ?? current.status,
        assigneeSessionID:
          input.assigneeSessionID === undefined
            ? current.assigneeSessionID
            : (input.assigneeSessionID ?? undefined),
        lastNudgedAt: input.lastNudgedAt === undefined ? current.lastNudgedAt : (input.lastNudgedAt ?? undefined),
      }
      yield* events.publish(
        SwarmEvent.BoardItemUpdated,
        {
          timestamp,
          swarmID: current.swarmID,
          itemID: current.id,
          kind: current.kind,
          title: next.title,
          body: next.body,
          status: next.status,
          ...(next.assigneeSessionID ? { assigneeSessionID: next.assigneeSessionID } : {}),
          ...(next.lastNudgedAt === undefined ? {} : { lastNudgedAt: next.lastNudgedAt }),
        },
        {
          commit: () =>
            db
              .update(SwarmBoardTable)
              .set({
                title: next.title,
                body: next.body,
                status: next.status,
                assignee_session_id: next.assigneeSessionID,
                last_nudged_at: next.lastNudgedAt,
                time_updated: DateTime.toEpochMillis(timestamp),
              })
              .where(eq(SwarmBoardTable.id, input.id))
              .run()
              .pipe(Effect.orDie),
        },
      )
      return yield* get(input.id)
    })

    const list = Effect.fn("SwarmBoard.list")(function* (input: ListInput) {
      const rows = yield* db
        .select()
        .from(SwarmBoardTable)
        .where(
          and(
            eq(SwarmBoardTable.swarm_id, input.swarmID),
            ...(input.kind ? [eq(SwarmBoardTable.kind, input.kind)] : []),
            ...(input.status ? [eq(SwarmBoardTable.status, input.status)] : []),
          ),
        )
        .orderBy(desc(SwarmBoardTable.time_updated))
        .all()
        .pipe(Effect.orDie)
      return rows.map(fromRow)
    })

    return Service.of({ create, update, get, list })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node, EventV2.node] })
