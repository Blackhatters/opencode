import { afterEach, describe, expect, test } from "bun:test"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Database } from "@opencode-ai/core/database/database"
import { makeGlobalNode } from "@opencode-ai/core/effect/app-node"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2 } from "@opencode-ai/core/event"
import { ProjectV2 } from "@opencode-ai/core/project"
import { SwarmBoard } from "@opencode-ai/core/swarm/board"
import { Deferred, Effect, Layer } from "effect"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"
import { SwarmWatchdog, wakeInput } from "@/swarm/watchdog"
import { SwarmEvent } from "@opencode-ai/schema/swarm-event"
import { SessionID } from "@opencode-ai/schema/session-id"
import { MessageID } from "../../src/session/schema"
import { disposeAllInstances } from "../fixture/fixture"
import { awaitWithTimeout, testEffect } from "../lib/effect"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"

afterEach(async () => {
  await disposeAllInstances()
})

describe("SwarmWatchdog.wakeInput", () => {
  test("preserves the session agent so a wake cannot rewrite it", () => {
    const sessionID = SessionID.make("ses_worker")
    const input = wakeInput({ id: sessionID, agent: "worker" }, "continue")
    expect(input).toEqual({
      sessionID,
      agent: "worker",
      parts: [{ type: "text", text: "continue", synthetic: true }],
    })
  })

  test("skips sessions with no agent", () => {
    expect(wakeInput({ id: SessionID.make("ses_none") }, "continue")).toBeUndefined()
  })
})

const workerID = SessionID.make("ses_worker")
const managerID = SessionID.make("ses_manager")

const dummy: SessionV1.WithParts = {
  info: {
    id: MessageID.ascending(),
    role: "assistant",
    parentID: MessageID.ascending(),
    sessionID: workerID,
    mode: "worker",
    agent: "worker",
    cost: 0,
    path: { cwd: "/tmp", root: "/tmp" },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ModelV2.ID.make("test-model"),
    providerID: ProviderV2.ID.make("test"),
    time: { created: Date.now() },
    finish: "stop",
  },
  parts: [],
}

let onPrompt: ((input: SessionPrompt.PromptInput) => void) | undefined
let subscriber: EventV2.Subscriber | undefined

const promptStub = LayerNode.make({
  service: SessionPrompt.Service,
  layer: Layer.mock(SessionPrompt.Service, {
    prompt: (input) =>
      Effect.sync(() => {
        onPrompt?.(input)
        return dummy
      }),
    loop: () => Effect.succeed(dummy),
    cancel: () => Effect.void,
    resolvePromptParts: () => Effect.succeed([]),
  }),
  deps: [],
})

const eventsStub = LayerNode.make({
  service: EventV2Bridge.Service,
  layer: Layer.mock(EventV2Bridge.Service, {
    listen: (listener) =>
      Effect.sync(() => {
        subscriber = listener
        return Effect.void
      }),
  }),
  deps: [],
})

const sessionStub = LayerNode.make({
  service: Session.Service,
  layer: Layer.mock(Session.Service, {
    get: (id) =>
      Effect.succeed({
        id,
        slug: "worker",
        projectID: ProjectV2.ID.make("proj_swarm"),
        directory: "/tmp",
        title: "worker",
        agent: "worker",
        version: "0",
        time: { created: 0, updated: 0 },
      }),
  }),
  deps: [],
})

const configStub = LayerNode.make({
  service: Config.Service,
  layer: Layer.mock(Config.Service, {
    get: () => Effect.succeed({ swarm: { enabled: true } }),
  }),
  deps: [],
})

const agentStub = LayerNode.make({
  service: Agent.Service,
  layer: Layer.mock(Agent.Service, {
    get: () =>
      Effect.succeed({
        name: "worker",
        permission: [],
        options: { swarm: true },
        mode: "subagent",
        native: true,
      }),
  }),
  deps: [],
})

const boardStub = makeGlobalNode({
  service: SwarmBoard.Service,
  layer: Layer.mock(SwarmBoard.Service, {
    list: () => Effect.succeed([]),
    update: () => Effect.succeed(undefined),
  }),
  deps: [],
})

const databaseStub = makeGlobalNode({
  service: Database.Service,
  layer: Layer.mock(Database.Service, {
    db: {} as Database.Interface["db"],
  }),
  deps: [],
})

const it = testEffect(
  LayerNode.compile(SwarmWatchdog.node, [
    [SessionPrompt.node, promptStub],
    [EventV2Bridge.node, eventsStub],
    [Session.node, sessionStub],
    [Config.node, configStub],
    [Agent.node, agentStub],
    [SwarmBoard.node, boardStub],
    [Database.node, databaseStub],
  ]),
)

describe("SwarmWatchdog", () => {
  it.effect("wakes a worker session with that session's agent, not the default", () =>
    Effect.gen(function* () {
      yield* SwarmWatchdog.Service
      const received = yield* Deferred.make<SessionPrompt.PromptInput>()
      onPrompt = (input) => Deferred.doneUnsafe(received, Effect.succeed(input))
      if (!subscriber) throw new Error("watchdog did not subscribe")

      yield* subscriber({
        id: EventV2.ID.make("evt_dm"),
        type: SwarmEvent.DMPosted.type,
        data: {
          toSessionID: workerID,
          fromSessionID: managerID,
          fromAgent: "manager",
          text: "please continue the assigned task",
        },
      } as EventV2.Payload)

      const input = yield* awaitWithTimeout(Deferred.await(received), "watchdog never woke the worker")
      expect(input.sessionID).toBe(workerID)
      expect(input.agent).toBe("worker")
      expect(input.parts).toEqual([
        {
          type: "text",
          text: `Direct message from manager (${managerID}):\nplease continue the assigned task`,
          synthetic: true,
        },
      ])
    }),
  )
})
