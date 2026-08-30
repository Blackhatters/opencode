import { describe, expect, test } from "bun:test"
import { ConfigSwarm } from "@opencode-ai/core/config/swarm"

describe("ConfigSwarm", () => {
  test("depthLimit stays 1 unless swarm is enabled", () => {
    expect(ConfigSwarm.depthLimit({})).toBe(1)
    expect(ConfigSwarm.depthLimit({ subagent_depth: 2 })).toBe(2)
    expect(ConfigSwarm.depthLimit({ swarm: { enabled: false } })).toBe(1)
  })

  test("enabled swarm raises the default depth to 3", () => {
    expect(ConfigSwarm.depthLimit({ swarm: { enabled: true } })).toBe(3)
    expect(ConfigSwarm.depthLimit({ swarm: { enabled: true }, subagent_depth: 5 })).toBe(5)
  })

  test("an explicit subagent_depth still wins when swarm is enabled", () => {
    expect(ConfigSwarm.depthLimit({ swarm: { enabled: true }, subagent_depth: 1 })).toBe(1)
    expect(ConfigSwarm.depthLimit({ swarm: { enabled: true }, subagent_depth: 2 })).toBe(2)
  })

  test("fromDocuments merges layered swarm objects field by field", () => {
    const merged = ConfigSwarm.fromDocuments([
      new ConfigSwarm.Info({ enabled: true, id: "global" }),
      new ConfigSwarm.Info({ enabled: true }),
    ])
    expect(merged?.enabled).toBe(true)
    expect(merged?.id).toBe("global")
  })
})
