export * as SwarmView from "./view"

import { Effect } from "effect"
import { Swarm } from "@opencode-ai/schema/swarm"
import { SessionID } from "@opencode-ai/schema/session-id"
import { SwarmBoard } from "@opencode-ai/core/swarm/board"
import { SwarmChat } from "@opencode-ai/core/swarm/chat"
import { Config } from "@/config/config"
import { InstanceRef } from "@/effect/instance-ref"
import { Locale } from "@/util/locale"

export type Section = "board" | "chat" | "dm"

export interface Snapshot {
  readonly swarmID: Swarm.ID
  readonly enabled: boolean
  readonly board: ReadonlyArray<Swarm.BoardItem>
  readonly chat: ReadonlyArray<Swarm.Message>
  readonly dm: ReadonlyArray<Swarm.Message>
}

export interface LoadInput {
  readonly swarmID?: string
  readonly limit?: number
  readonly kind?: Swarm.BoardKind
  readonly status?: Swarm.BoardStatus
  readonly sessionID?: string
}

export const load = Effect.fn("SwarmView.load")(function* (input: LoadInput = {}) {
  const config = yield* Config.Service
  const board = yield* SwarmBoard.Service
  const chat = yield* SwarmChat.Service
  const ctx = yield* InstanceRef
  if (!ctx) return yield* Effect.die("InstanceRef not provided")
  const cfg = yield* config.get()
  const swarmID = Swarm.ID.make(input.swarmID ?? cfg.swarm?.id ?? ctx.project.id)
  const [items, messages, dms] = yield* Effect.all([
    board.list({
      swarmID,
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.status ? { status: input.status } : {}),
    }),
    chat.listChat(swarmID, input.limit ?? 50),
    chat.listDM({
      swarmID,
      ...(input.sessionID ? { sessionID: SessionID.make(input.sessionID) } : {}),
      limit: input.limit ?? 50,
    }),
  ])
  return {
    swarmID,
    enabled: cfg.swarm?.enabled === true,
    board: items,
    chat: messages,
    dm: dms,
  } satisfies Snapshot
})

export function format(snapshot: Snapshot, section?: Section) {
  const lines = [
    `Swarm ${snapshot.swarmID}`,
    snapshot.enabled ? "enabled" : "disabled",
  ]
  if (!section || section === "board") {
    lines.push("", "Board")
    if (snapshot.board.length === 0) lines.push("(no items)")
    for (const item of snapshot.board) {
      const assignee = item.assigneeSessionID ? `  assignee ${item.assigneeSessionID}` : ""
      lines.push(`${item.kind.padEnd(6)}  ${item.status.padEnd(11)}  ${item.title}${assignee}`)
      lines.push(`  ${item.id}`)
      if (item.body) lines.push(`  ${item.body}`)
    }
  }
  if (!section || section === "chat") {
    lines.push("", "Chat")
    if (snapshot.chat.length === 0) lines.push("(empty)")
    for (const message of snapshot.chat) lines.push(formatMessage(message))
  }
  if (!section || section === "dm") {
    lines.push("", "Direct messages")
    if (snapshot.dm.length === 0) lines.push("(empty)")
    for (const message of snapshot.dm) lines.push(formatMessage(message))
  }
  return lines.join("\n")
}

function formatMessage(message: Swarm.Message) {
  const time = Locale.todayTimeOrDateTime(message.timeCreated)
  if (!message.toSessionID) return `${time}  ${message.fromAgent}  ${message.text}`
  return `${time}  ${message.fromAgent} -> ${message.toSessionID}  ${message.text}`
}
