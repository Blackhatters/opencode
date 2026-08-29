export * as ConfigSwarm from "./swarm"

import { Schema } from "effect"

export class Info extends Schema.Class<Info>("Config.Swarm")({
  enabled: Schema.Boolean.pipe(Schema.optional).annotate({
    description: "Enable the autonomous agent swarm: communication tools, shared board, RAG, and idle watchdog",
  }),
  id: Schema.String.pipe(Schema.optional).annotate({
    description: "Stable swarm identifier. Defaults to the current project ID when omitted",
  }),
  infinite_permissions: Schema.Boolean.pipe(Schema.optional).annotate({
    description: "Bypass parent deny rules when spawning swarm agents so each agent keeps unrestricted tool access",
  }),
}) {}

const DEFAULT_DEPTH = 1
const SWARM_DEPTH = 3

export function depthLimit(input: { swarm?: { enabled?: boolean }; subagent_depth?: number }) {
  const configured = input.subagent_depth ?? DEFAULT_DEPTH
  if (input.swarm?.enabled === true) return Math.max(configured, SWARM_DEPTH)
  return configured
}

export function fromDocuments(swarms: ReadonlyArray<Info | undefined>) {
  const found = swarms.filter((item): item is Info => item !== undefined)
  if (found.length === 0) return
  return found.reduce((current, next) => new Info({ ...current, ...next }))
}
