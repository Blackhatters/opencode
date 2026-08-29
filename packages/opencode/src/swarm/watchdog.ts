import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Context, Effect, Layer, Scope } from "effect"
import { Swarm } from "@opencode-ai/schema/swarm"
import { SwarmEvent } from "@opencode-ai/schema/swarm-event"
import { SessionID } from "@opencode-ai/schema/session-id"
import { SessionInput } from "@opencode-ai/core/session/input"
import { Database } from "@opencode-ai/core/database/database"
import { SwarmBoard } from "@opencode-ai/core/swarm/board"
import { Config } from "@/config/config"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Agent } from "@/agent/agent"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"
import { SessionStatus } from "@/session/status"

const NUDGE_MS = 5 * 60 * 1000

export interface Interface {
  readonly enabled: () => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SwarmWatchdog") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const events = yield* EventV2Bridge.Service
    const prompt = yield* SessionPrompt.Service
    const sessions = yield* Session.Service
    const agents = yield* Agent.Service
    const board = yield* SwarmBoard.Service
    const { db } = yield* Database.Service
    const scope = yield* Scope.Scope

    const enabled = Effect.fn("SwarmWatchdog.enabled")(function* () {
      return (yield* config.get()).swarm?.enabled === true
    })

    const wake = Effect.fn("SwarmWatchdog.wake")(function* (sessionID: SessionID, text: string) {
      const session = yield* sessions.get(sessionID)
      yield* prompt
        .prompt({
          sessionID,
          // Omit agent and createUserMessage falls back to defaultInfo(), then
          // setAgentModel rewrites a worker/manager onto build.
          ...(session.agent ? { agent: session.agent } : {}),
          parts: [{ type: "text", text, synthetic: true }],
        })
        .pipe(Effect.ignore, Effect.forkIn(scope))
    })

    const unsubscribe = yield* events.listen((event) =>
      Effect.gen(function* () {
        if (!(yield* enabled())) return
        if (event.type === SwarmEvent.DMPosted.type) {
          const data = event.data as {
            toSessionID: SessionID
            fromSessionID: SessionID
            fromAgent: string
            text: string
          }
          if (data.toSessionID === data.fromSessionID) return
          yield* wake(data.toSessionID, `Direct message from ${data.fromAgent} (${data.fromSessionID}):\n${data.text}`)
          return
        }
        if (event.type !== SessionStatus.Event.Status.type) return
        const data = event.data as { sessionID: SessionID; status: SessionStatus.Info }
        if (data.status.type !== "idle") return
        if (yield* SessionInput.hasPending(db, data.sessionID, "steer")) {
          yield* prompt.loop({ sessionID: data.sessionID }).pipe(Effect.ignore, Effect.forkIn(scope))
          return
        }
        if (yield* SessionInput.hasPending(db, data.sessionID, "queue")) {
          yield* prompt.loop({ sessionID: data.sessionID }).pipe(Effect.ignore, Effect.forkIn(scope))
          return
        }
        const session = yield* sessions.get(data.sessionID).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
        if (!session?.agent) return
        const agent = yield* agents.get(session.agent)
        if (agent.options.swarm !== true) return
        const cfg = yield* config.get()
        const swarmID = Swarm.ID.make(cfg.swarm?.id ?? session.projectID)
        const items = (yield* board.list({ swarmID })).filter(
          (item) =>
            item.assigneeSessionID === data.sessionID &&
            item.status !== "done" &&
            (item.lastNudgedAt === undefined || Date.now() - item.lastNudgedAt > NUDGE_MS),
        )
        if (items.length === 0) return
        yield* Effect.forEach(items, (item) => board.update({ id: item.id, lastNudgedAt: Date.now() }), {
          discard: true,
        })
        yield* wake(
          data.sessionID,
          [
            "You went idle with open swarm board items assigned to this session:",
            ...items.map((item) => `- ${item.id} [${item.status}] ${item.title}`),
            "Continue the assigned work or mark items blocked with a reason.",
          ].join("\n"),
        )
      }).pipe(Effect.ignore),
    )
    yield* Effect.addFinalizer(() => unsubscribe)

    return Service.of({ enabled })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [
    Config.node,
    EventV2Bridge.node,
    SessionPrompt.node,
    Session.node,
    Agent.node,
    SwarmBoard.node,
    Database.node,
  ],
})

export * as SwarmWatchdog from "./watchdog"
