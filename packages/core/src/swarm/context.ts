export * as SwarmContext from "./context"

import { Effect, Layer, Schema } from "effect"
import { Swarm } from "@opencode-ai/schema/swarm"
import { Config } from "../config"
import { makeLocationNode } from "../effect/app-node"
import { Location } from "../location"
import { SystemContext } from "../system-context/index"
import { SystemContextRegistry } from "../system-context/registry"
import { SwarmBoard } from "./board"
import { SwarmChat } from "./chat"

const BoardItem = Schema.Struct({
  id: Schema.String,
  kind: Schema.String,
  status: Schema.String,
  title: Schema.String,
})

const ChatMessage = Schema.Struct({
  id: Schema.String,
  fromAgent: Schema.String,
  text: Schema.String,
})

const DirectMessage = Schema.Struct({
  id: Schema.String,
  fromAgent: Schema.String,
  toSessionID: Schema.optional(Schema.String),
  text: Schema.String,
})

const Snapshot = Schema.Struct({
  swarmID: Schema.String,
  board: Schema.Array(BoardItem),
  chat: Schema.Array(ChatMessage),
  dm: Schema.Array(DirectMessage),
})
type Snapshot = typeof Snapshot.Type

interface DiffFlags {
  readonly board: boolean
  readonly chat: boolean
  readonly dm: boolean
}

function formatBoard(items: ReadonlyArray<typeof BoardItem.Type>) {
  if (items.length === 0) return "    (empty)"
  return items
    .map((item) => `    <item id="${item.id}" kind="${item.kind}" status="${item.status}">${item.title}</item>`)
    .join("\n")
}

function formatChat(messages: ReadonlyArray<{ fromAgent: string; text: string }>) {
  if (messages.length === 0) return "    (empty)"
  return messages.map((message) => `    <message from="${message.fromAgent}">${message.text}</message>`).join("\n")
}

function formatDM(messages: ReadonlyArray<typeof DirectMessage.Type>) {
  if (messages.length === 0) return "    (empty)"
  return messages
    .map((message) => {
      const to = message.toSessionID ? ` to="${message.toSessionID}"` : ""
      return `    <message from="${message.fromAgent}"${to}>${message.text}</message>`
    })
    .join("\n")
}

function render(input: { swarmID: string; board: string; chat: string; dm: string }) {
  return [
    "Shared swarm memory for this project.",
    "<swarm>",
    `  <id>${input.swarmID}</id>`,
    "  <board>",
    input.board,
    "  </board>",
    "  <chat>",
    input.chat,
    "  </chat>",
    "  <dm>",
    input.dm,
    "  </dm>",
    "</swarm>",
  ].join("\n")
}

function renderBaseline(current: Snapshot, flags: DiffFlags) {
  return render({
    swarmID: current.swarmID,
    board: formatBoard(flags.board ? [] : current.board),
    chat: formatChat(flags.chat ? [] : current.chat),
    dm: formatDM(flags.dm ? [] : current.dm),
  })
}

function renderUpdate(previous: Snapshot, current: Snapshot, flags: DiffFlags) {
  const board = boardChanges(previous.board, current.board)
  const chat = addedByID(previous.chat, current.chat)
  const dm = addedByID(previous.dm, current.dm)
  if (flags.board && flags.chat && flags.dm) {
    const parts = [
      ...boardUpdate(board),
      ...messageUpdate("New swarm chat messages:", chat),
      ...messageUpdate("New swarm direct messages:", dm),
    ]
    if (parts.length > 0) return parts.join("\n")
  }
  return render({
    swarmID: current.swarmID,
    board: formatBoard(flags.board ? board : current.board),
    chat: formatChat(flags.chat ? chat : current.chat),
    dm: formatDM(flags.dm ? dm : current.dm),
  })
}

function boardChanges(previous: Snapshot["board"], current: Snapshot["board"]) {
  const before = new Map(previous.map((item) => [item.id, item]))
  const after = new Set(current.map((item) => item.id))
  return [
    ...current.filter((item) => {
      const prior = before.get(item.id)
      if (!prior) return true
      return prior.kind !== item.kind || prior.status !== item.status || prior.title !== item.title
    }),
    ...previous.filter((item) => !after.has(item.id)).map((item) => ({ ...item, status: "done" })),
  ]
}

function addedByID<A extends { id: string }>(previous: ReadonlyArray<A>, current: ReadonlyArray<A>) {
  const seen = new Set(previous.map((item) => item.id))
  return current.filter((item) => !seen.has(item.id))
}

function boardUpdate(items: ReturnType<typeof boardChanges>) {
  if (items.length === 0) return []
  return [
    "Swarm board updates:",
    ...items.map((item) => `<item id="${item.id}" kind="${item.kind}" status="${item.status}">${item.title}</item>`),
  ]
}

function messageUpdate(title: string, messages: ReadonlyArray<{ fromAgent: string; text: string }>) {
  if (messages.length === 0) return []
  return [title, ...messages.map((message) => `<message from="${message.fromAgent}">${message.text}</message>`)]
}

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const config = yield* Config.Service
    const location = yield* Location.Service
    const registry = yield* SystemContextRegistry.Service
    const board = yield* SwarmBoard.Service
    const chat = yield* SwarmChat.Service
    const entries = yield* config.entries()
    const swarm = Config.latest(entries, "swarm")
    if (swarm?.enabled !== true) return
    const swarmID = Swarm.ID.make(swarm.id ?? location.project.id)
    const flags = {
      board: swarm.board_diff !== false,
      chat: swarm.chat_diff !== false,
      dm: swarm.dm_diff !== false,
    }

    yield* registry.register({
      key: SystemContext.Key.make("core/swarm"),
      load: Effect.gen(function* () {
        const [items, messages, dms] = yield* Effect.all([
          board.list({ swarmID }),
          chat.listChat(swarmID, 12),
          chat.listDM({ swarmID, limit: 12 }),
        ])
        const value = {
          swarmID,
          board: items
            .filter((item) => item.status !== "done")
            .map((item) => ({
              id: item.id,
              kind: item.kind,
              status: item.status,
              title: item.title,
            })),
          chat: messages.map((message) => ({
            id: message.id,
            fromAgent: message.fromAgent,
            text: message.text,
          })),
          dm: dms.map((message) => ({
            id: message.id,
            fromAgent: message.fromAgent,
            ...(message.toSessionID ? { toSessionID: message.toSessionID } : {}),
            text: message.text,
          })),
        }
        return SystemContext.make({
          key: SystemContext.Key.make("core/swarm"),
          codec: Schema.toCodecJson(Snapshot),
          load: Effect.succeed(value),
          baseline: (current) => renderBaseline(current, flags),
          update: (previous, current) => renderUpdate(previous, current, flags),
        })
      }),
    })
  }),
)

export const node = makeLocationNode({
  name: "swarm-context",
  layer,
  deps: [Config.node, Location.node, SystemContextRegistry.node, SwarmBoard.node, SwarmChat.node],
})
