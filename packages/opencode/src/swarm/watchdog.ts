import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Context, Effect, Layer, Scope } from "effect"
import { Swarm } from "@opencode-ai/schema/swarm"
import { SwarmEvent } from "@opencode-ai/schema/swarm-event"
import { SessionID } from "@opencode-ai/schema/session-id"
import { SwarmBoard } from "@opencode-ai/core/swarm/board"
import { Config } from "@/config/config"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Agent } from "@/agent/agent"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"
import { SessionStatus } from "@/session/status"

const NUDGE_MS = 5 * 60 * 1000

export function wakeInput(session: { id: SessionID; agent?: string }, text: string) {
  if (!session.agent) return
  return {
    sessionID: session.id,
    agent: session.agent,
    parts: [{ type: "text" as const, text, synthetic: true as const }],
  }
}

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
    const scope = yield* Scope.Scope

    const enabled = Effect.fn("SwarmWatchdog.enabled")(function* () {
      return (yield* config.get()).swarm?.enabled === true
    })

    const swarmSession = Effect.fn("SwarmWatchdog.swarmSession")(function* (sessionID: SessionID) {
      const session = yield* sessions.get(sessionID).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
      if (!session?.agent) return
      const agent = yield* agents.get(session.agent)
      if (agent.options.swarm !== true) return
      return session
    })

    const wake = Effect.fn("SwarmWatchdog.wake")(function* (sessionID: SessionID, text: string) {
      const session = yield* swarmSession(sessionID)
      if (!session) return false
      const input = wakeInput(session, text)
      if (!input) return false
      yield* prompt.prompt(input)
      return true
    })

    const startWake = (sessionID: SessionID, text: string, after?: Effect.Effect<void>) =>
      wake(sessionID, text).pipe(
        Effect.flatMap((ok) => (ok && after ? after : Effect.void)),
        Effect.catchCause((cause) => Effect.logError("SwarmWatchdog.wake failed", { cause })),
        Effect.forkIn(scope),
      )

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
          yield* startWake(
            data.toSessionID,
            `Direct message from ${data.fromAgent} (${data.fromSessionID}):\n${data.text}`,
          )
          return
        }
        if (event.type !== SessionStatus.Event.Status.type) return
        const data = event.data as { sessionID: SessionID; status: SessionStatus.Info }
        if (data.status.type !== "idle") return
        const session = yield* swarmSession(data.sessionID)
        if (!session) return
        const cfg = yield* config.get()
        const swarmID = Swarm.ID.make(cfg.swarm?.id ?? session.projectID)
        const items = (yield* board.list({ swarmID })).filter(
          (item) =>
            item.assigneeSessionID === data.sessionID &&
            item.status !== "done" &&
            (item.lastNudgedAt === undefined || Date.now() - item.lastNudgedAt > NUDGE_MS),
        )
        if (items.length === 0) return
        yield* startWake(
          data.sessionID,
          [
            "You went idle with open swarm board items assigned to this session:",
            ...items.map((item) => `- ${item.id} [${item.status}] ${item.title}`),
            "Continue the assigned work or mark items blocked with a reason.",
          ].join("\n"),
          Effect.forEach(items, (item) => board.update({ id: item.id, lastNudgedAt: Date.now() }), {
            discard: true,
          }),
        )
      }).pipe(Effect.catchCause((cause) => Effect.logError("SwarmWatchdog.listen failed", { cause }))),
    )
    yield* Effect.addFinalizer(() => unsubscribe)

    return Service.of({ enabled })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [Config.node, EventV2Bridge.node, SessionPrompt.node, Session.node, Agent.node, SwarmBoard.node],
})

export * as SwarmWatchdog from "./watchdog"
