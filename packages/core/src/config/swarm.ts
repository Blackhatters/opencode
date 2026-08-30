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
  board_diff: Schema.Boolean.pipe(Schema.optional).annotate({
    description:
      "When true (the default), new sessions start with an empty swarm board and receive later board changes as context diffs. Set false to include open board items in the session baseline",
  }),
  chat_diff: Schema.Boolean.pipe(Schema.optional).annotate({
    description:
      "When true (the default), new sessions start with empty swarm chat and receive later posts as context diffs. Set false to include recent chat in the session baseline",
  }),
  dm_diff: Schema.Boolean.pipe(Schema.optional).annotate({
    description:
      "When true (the default), new sessions start with empty swarm DMs and receive later direct messages as context diffs. Set false to include recent DMs in the session baseline",
  }),
}) {}

const DEFAULT_DEPTH = 1
const SWARM_DEPTH = 3

export function depthLimit(input: { swarm?: { enabled?: boolean }; subagent_depth?: number }) {
  if (input.subagent_depth !== undefined) return input.subagent_depth
  if (input.swarm?.enabled === true) return SWARM_DEPTH
  return DEFAULT_DEPTH
}

export function fromDocuments(swarms: ReadonlyArray<Info | undefined>) {
  const found = swarms.filter((item): item is Info => item !== undefined)
  if (found.length === 0) return
  return found.reduce((current, next) => new Info({ ...current, ...next }))
}
